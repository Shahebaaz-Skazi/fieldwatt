/**
 * scripts/resend-kot009-outreach.js
 *
 * Direct script to resend WhatsApp self-reading requests to KOT009_E customers
 * whose messages were silently dropped by Meta yesterday (remained in 'sent' state without delivery).
 * Limits itself to 240 messages to avoid hitting the 250 rolling daily limit.
 *
 * Usage:
 *   node scripts/resend-kot009-outreach.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../src/utils/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendOneMessage({ phoneId, accessToken, templateName, langCode, phone, name, token }) {
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
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
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function run() {
  console.log('====================================================');
  console.log('    RESENDING OUTREACH TO KOT009_E CUSTOMERS        ');
  console.log('====================================================\n');

  const secret       = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
  const origin       = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';
  const phoneId      = process.env.WHATSAPP_PHONE_NUMBER_ID || '1346469295207654';
  const accessToken  = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'meter_reading_request';
  const langCode     = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

  if (!accessToken) {
    console.error('❌ ERROR: WHATSAPP_ACCESS_TOKEN is not configured in .env');
    process.exit(1);
  }

  // 1. Fetch active cycle
  console.log('- Fetching active billing cycle...');
  const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 LIMIT 1');
  if (cycleRes.rows.length === 0) {
    console.error('❌ ERROR: No active cycle found in database.');
    process.exit(1);
  }
  const cycleId = cycleRes.rows[0].id;

  // 2. Fetch failed/undelivered logs (status = 'sent' and sent_at < today)
  console.log('- Fetching undelivered logs from yesterday...');
  const query = `
    SELECT id, property_id, phone_number, consumer_name
    FROM whatsapp_logs
    WHERE cycle_id = $1
      AND status = 'sent'
      AND sent_at < '2026-08-27 00:00:00'
    ORDER BY consumer_name ASC
    LIMIT 240
  `;
  const logsRes = await db.query(query, [cycleId]);
  const logs = logsRes.rows;
  console.log(`  Found ${logs.length} logs to resend today (capped at 240).`);

  if (logs.length === 0) {
    console.log('✅ No pending resent logs found for today.');
    process.exit(0);
  }

  let sentCount = 0;
  let failedCount = 0;

  console.log('\n- Starting paced resend (~20 messages/sec)...');
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // Re-sign JWT token
    const token = jwt.sign(
      { propertyId: log.property_id, assignmentId: null },
      secret,
      { expiresIn: '30d' }
    );

    // Send via Meta API
    const res = await sendOneMessage({
      phoneId,
      accessToken,
      templateName,
      langCode,
      phone: log.phone_number,
      name: log.consumer_name,
      token
    });

    const status = res.ok ? 'sent' : 'failed';
    const errMsg = res.ok ? null : res.error;
    const wamid = res.ok ? res.wamid : null;

    if (res.ok) {
      sentCount++;
      console.log(`[${i+1}/${logs.length}] ✅ Resent to ${log.consumer_name} (${log.phone_number})`);
    } else {
      failedCount++;
      console.error(`[${i+1}/${logs.length}] ❌ Failed for ${log.consumer_name} (${log.phone_number}): ${errMsg}`);
    }

    // Update existing row in D1
    await db.query(
      `UPDATE whatsapp_logs 
       SET token = $1, status = $2, error_message = $3, wamid = $4, sent_at = datetime('now')
       WHERE id = $5`,
      [token, status, errMsg, wamid, log.id]
    ).catch(e => console.error('Failed to update log:', e));

    // Pacing delay: 100ms
    await sleep(100);
  }

  console.log('\n====================================================');
  console.log('                 RESEND SUMMARY                  ');
  console.log('====================================================');
  console.log(`  Total Attempted:   ${logs.length}`);
  console.log(`  Successfully Sent: ${sentCount}`);
  console.log(`  Failed:            ${failedCount}`);
  console.log('====================================================\n');
}

run().catch(console.error);
