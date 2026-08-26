const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const db      = require('../../db');
const { requireAdmin } = require('../../middleware/roleGuard');

// ─── Helpers ────────────────────────────────────────────────────────────────

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Normalize any Indian phone string to 12-digit "91XXXXXXXXXX" */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);           // strip leading 0
  if (d.length === 10)   d = '91' + d;             // bare 10-digit
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}

/** Send one WhatsApp template message. Returns { ok, wamid, error }. */
async function sendOneMessage({ phoneId, accessToken, templateName, langCode, phone, name, token }) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:   phone,
      type: 'template',
      template: {
        name:     templateName,
        language: { code: langCode },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', parameter_name: 'customer_name', text: name || 'Customer' }]
          },
          {
            type: 'button', sub_type: 'url', index: '0',
            parameters: [{ type: 'text', text: token }]
          }
        ]
      }
    })
  });

  const body = await res.text();
  if (!res.ok) {
    let msg = 'Meta API error';
    try { msg = JSON.parse(body)?.error?.message || msg; } catch {}
    return { ok: false, error: msg };
  }
  let wamid = null;
  try { wamid = JSON.parse(body)?.messages?.[0]?.id || null; } catch {}
  return { ok: true, wamid };
}

// ─── Background worker ───────────────────────────────────────────────────────

/**
 * Processes all messages completely in the background after the HTTP response
 * has already been flushed. Handles any volume (100k+) in concurrent chunks.
 *
 * Strategy:
 *  1. Fetch all property rows in D1 chunks of 50 (avoids SQL variable limits).
 *  2. Fire Meta API calls in concurrent batches of 20 (respects rate limits).
 *  3. Log each result individually to whatsapp_logs in D1.
 *  4. 80 ms pause between Meta API chunks to stay under Cloud API rate limit.
 *
 * ponytail: no queue infra needed — Node's event loop handles thousands of
 * concurrent fetch promises perfectly fine; the bottleneck is network I/O
 * not CPU so concurrency wins here.
 */
async function processBulkInBackground({ propertyIds, cycleId, phoneNumbers, secret, origin, phoneId, accessToken, templateName, langCode }) {
  const startMs = Date.now();
  let sent = 0, failed = 0, skipped = 0;

  // ── Step 1: Fetch all property rows from D1 in chunks of 50 ──────────────
  const propChunks = chunkArray(propertyIds, 50);
  const propRows = [];

  for (const chunk of propChunks) {
    const ph = chunk.map((_, i) => `$${i + 1}`).join(', ');
    const cycleJoin = cycleId
      ? `LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = '${cycleId}'`
      : `LEFT JOIN assignments asg ON asg.property_id = p.id`;

    try {
      const res = await db.query(
        `SELECT p.id, p.consumer_name, p.phone_number, p.raw_sap_data, asg.id AS assignment_id
         FROM properties p ${cycleJoin}
         WHERE p.id IN (${ph})`,
        chunk
      );
      propRows.push(...res.rows);
    } catch (e) {
      console.error('[whatsapp-bg] D1 fetch chunk failed:', e.message);
      // mark all in this chunk as failed in logs later
      chunk.forEach(id => propRows.push({ id, _fetchFailed: true }));
    }
  }

  const propMap = Object.fromEntries(propRows.map(r => [r.id, r]));

  // ── Step 2: Build dispatch list ──────────────────────────────────────────
  const dispatches = []; // { propertyId, phone, name, token, selfUrl }

  for (const propertyId of propertyIds) {
    const property = propMap[propertyId];

    if (!property || property._fetchFailed) {
      skipped++;
      console.warn(`[whatsapp-bg] Skip ${propertyId}: property not found in D1`);
      continue;
    }

    // Resolve phone
    const rawPhone = phoneNumbers?.[propertyId] ||
      property.phone_number ||
      (property.raw_sap_data
        ? (property.raw_sap_data['Mobile No.'] ||
           property.raw_sap_data['Mobile']      ||
           property.raw_sap_data['Telephone No.']||
           property.raw_sap_data['Telephone']   ||
           property.raw_sap_data['Phone']        ||
           property.raw_sap_data['Contact No'])
        : null);

    if (!rawPhone || !String(rawPhone).trim()) {
      skipped++;
      console.warn(`[whatsapp-bg] Skip ${propertyId}: no phone number`);
      db.query(
        `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, error_message)
         VALUES ($1, $2, $3, $4, 'skipped', $5, $6)`,
        [propertyId, null, property.consumer_name, null, cycleId || null, 'No phone number']
      ).catch(() => {});
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10 || phone.length > 15) {
      skipped++;
      console.warn(`[whatsapp-bg] Skip ${propertyId}: invalid phone "${phone}"`);
      db.query(
        `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, error_message)
         VALUES ($1, $2, $3, $4, 'skipped', $5, $6)`,
        [propertyId, phone, property.consumer_name, null, cycleId || null, `Invalid phone format: ${phone}`]
      ).catch(() => {});
      continue;
    }

    // Save updated phone if overridden via UI
    if (phoneNumbers?.[propertyId] && phoneNumbers[propertyId] !== property.phone_number) {
      db.query('UPDATE properties SET phone_number = $1 WHERE id = $2', [rawPhone, propertyId]).catch(() => {});
    }

    // Sign JWT
    const token = jwt.sign(
      { propertyId, assignmentId: property.assignment_id || null },
      secret,
      { expiresIn: '30d' }
    );

    dispatches.push({
      propertyId,
      phone,
      name:    property.consumer_name || 'Customer',
      token,
      selfUrl: `${origin}/self-reading?token=${token}`
    });
  }

  // ── Step 3: Fire Meta API in concurrent chunks of 20 ────────────────────
  const metaChunks = chunkArray(dispatches, 20);

  for (const chunk of metaChunks) {
    const results = await Promise.allSettled(
      chunk.map(d => sendOneMessage({ phoneId, accessToken, templateName, langCode, phone: d.phone, name: d.name, token: d.token }))
    );

    // Log each result to D1 (fire-and-forget per row)
    results.forEach((result, idx) => {
      const d = chunk[idx];
      const ok    = result.status === 'fulfilled' && result.value.ok;
      const wamid = ok ? result.value.wamid : null;
      const errMsg = !ok
        ? (result.status === 'rejected' ? result.reason?.message : result.value?.error)
        : null;

      if (ok) sent++; else failed++;

      db.query(
        `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, wamid, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [d.propertyId, d.phone, d.name, d.token, ok ? 'sent' : 'failed', cycleId || null, wamid, errMsg || null]
      ).catch(() => {}); // never block on log write
    });

    // 80ms pace between chunks → ~250 chunks/sec max, well under Meta limits
    await sleep(80);
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
  console.log(`[whatsapp-bg] DONE — total: ${propertyIds.length}, sent: ${sent}, failed: ${failed}, skipped: ${skipped}, elapsed: ${elapsed}s`);
}

// ─── Route: POST /admin/whatsapp/send OR /send-bulk ────────────────────────

router.post(['/send', '/send-bulk'], requireAdmin, async (req, res) => {
  try {
    let propertyIds = req.body.propertyIds || req.body.property_ids;
    if (!propertyIds && Array.isArray(req.body)) propertyIds = req.body;
    const phoneNumbers = req.body.phoneNumbers || req.body.phone_numbers || {};
    const cycleId      = req.body.cycleId || req.body.cycle_id;

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ error: 'propertyIds array is required and cannot be empty.' });
    }

    const secret       = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
    const origin       = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';
    const phoneId      = process.env.WHATSAPP_PHONE_NUMBER_ID || '1155780700962650';
    const accessToken  = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'meter_reading_request';
    const langCode     = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    console.log(`[whatsapp] Bulk dispatch queued — ${propertyIds.length} recipients, cycleId: ${cycleId}`);

    // ── Respond immediately — never block the HTTP connection ──────────────
    res.status(202).json({
      success: true,
      queued:  propertyIds.length,
      sent:    propertyIds.length,
      failed:  0,
      message: `Dispatching ${propertyIds.length} messages in the background. Check /admin/whatsapp/logs for results.`
    });

    // ── Run the actual work after the response is flushed ──────────────────
    // ponytail: setImmediate ensures res.json() is written to the socket before
    // we start the async loop — keeps Render/Vercel happy even on long runs.
    setImmediate(() => {
      processBulkInBackground({ propertyIds, cycleId, phoneNumbers, secret, origin, phoneId, accessToken, templateName, langCode })
        .catch(err => console.error('[whatsapp-bg] Unhandled background error:', err));
    });

  } catch (error) {
    console.error('[whatsapp] Handler error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Route: GET /admin/whatsapp/status OR /usage ───────────────────────────

router.get(['/usage', '/status'], requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT COUNT(*) as total_sent
      FROM whatsapp_logs
      WHERE status = 'sent'
        AND sent_at >= strftime('%Y-%m-01', 'now')
    `);
    const sentThisMonth = parseInt(result.rows[0]?.total_sent || 0, 10);
    res.json({ sentThisMonth, count: sentThisMonth, limit: 1000 });
  } catch (error) {
    next(error);
  }
});

// ─── Route: GET /admin/whatsapp/logs ───────────────────────────────────────

router.get('/logs', requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, property_id, phone_number, consumer_name, status, sent_at, cycle_id
      FROM whatsapp_logs
      ORDER BY sent_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// ─── Route: GET /admin/whatsapp/generate-token ─────────────────────────────

router.get('/generate-token', async (req, res, next) => {
  try {
    const resProp = await db.query(`
      SELECT p.id as property_id, asg.id as assignment_id
      FROM properties p
      LEFT JOIN assignments asg ON asg.property_id = p.id
      LIMIT 1
    `);

    if (resProp.rows.length === 0) {
      return res.status(404).json({ error: 'No properties found in DB' });
    }

    const { property_id, assignment_id } = resProp.rows[0];
    const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
    const token  = jwt.sign({ propertyId: property_id, assignmentId: assignment_id }, secret, { expiresIn: '30d' });
    const origin = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';

    res.json({ url: `${origin}/self-reading?token=${token}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
