/**
 * Safe WhatsApp blast for today — 250 messages.
 * Pacing: 1 message per 2.5 seconds = 24/min — well under Meta's spam threshold.
 * 250 messages = ~10 minutes total runtime.
 *
 * Run: node scripts/send-today-250.js
 * Dry run: DRY_RUN=1 node scripts/send-today-250.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db  = require('../src/utils/db');
const jwt = require('jsonwebtoken');

const DRY_RUN       = process.env.DRY_RUN === '1';
const BATCH_SIZE    = 250;
const PACE_MS       = 2500;  // 2.5s between each message = 24/min
const PHONE_ID      = process.env.WHATSAPP_PHONE_NUMBER_ID || '1346469295207654';
const ACCESS_TOKEN  = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'meter_reading_request';
const LANG_CODE     = process.env.WHATSAPP_TEMPLATE_LANG  || 'en';
const JWT_SECRET    = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
const ORIGIN        = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10)   d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}

function format10DigitPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return d;
}

async function sendOne(phone, name, token) {
  if (DRY_RUN) {
    return { ok: true, wamid: 'DRY_RUN_WAMID' };
  }

  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  if (fast2smsKey) {
    // ─── Fast2SMS API Dispatch (SMS) ───
    const endpoint = 'https://www.fast2sms.com/dev/bulkV2';
    const tenDigitPhone = format10DigitPhone(phone);
    const origin = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';
    const readingUrl = `${origin}/self-reading?token=${token}`;
    
    const route = process.env.FAST2SMS_ROUTE || 'q';
    const messageTemplate = process.env.FAST2SMS_MESSAGE_TEMPLATE;
    const messageText = messageTemplate
      ? messageTemplate.replace('{{name}}', name || 'Customer').replace('{{url}}', readingUrl)
      : `Hello ${name || 'Customer'}, please submit your electricity meter reading using this link: ${readingUrl}`;

    const reqBody = {
      route: route,
      message: messageText,
      numbers: tenDigitPhone
    };

    if (process.env.FAST2SMS_SENDER_ID) reqBody.sender_id = process.env.FAST2SMS_SENDER_ID;
    if (process.env.FAST2SMS_TEMPLATE_ID) reqBody.template_id = process.env.FAST2SMS_TEMPLATE_ID;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'authorization': fast2smsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
    });

    const body = await res.text();
    let resJson = {};
    try { resJson = JSON.parse(body); } catch {}

    if (!res.ok || resJson.return === false) {
      const errMsg = (Array.isArray(resJson.message) ? resJson.message[0] : resJson.message) || 'Fast2SMS API error';
      return { ok: false, error: errMsg };
    }

    const msgId = resJson.request_id || (Array.isArray(resJson.message) ? resJson.message[0] : 'fast2sms_' + Date.now());
    return { ok: true, wamid: String(msgId) };
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
  const twilioContentSid = process.env.TWILIO_CONTENT_SID;

  if (twilioSid && twilioAuthToken && twilioFrom && twilioContentSid) {
    // ─── Twilio WhatsApp API Dispatch ───
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
    
    const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;
    const formattedFrom = twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom.startsWith('+') ? twilioFrom : '+' + twilioFrom}`;

    const bodyParams = new URLSearchParams({
      To: `whatsapp:${formattedPhone}`,
      From: formattedFrom,
      ContentSid: twilioContentSid,
      ContentVariables: JSON.stringify({
        "1": name || 'Customer',
        "2": token
      })
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    const body = await res.text();
    if (!res.ok) {
      let msg = 'Twilio API error';
      try { msg = JSON.parse(body)?.message || msg; } catch {}
      return { ok: false, error: msg };
    }
    let wamid = null;
    try { wamid = JSON.parse(body)?.sid || null; } catch {}
    return { ok: true, wamid };
  }

  // ─── Direct Meta Cloud API Dispatch ───
  const res = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: LANG_CODE },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'customer_name', text: name || 'Customer' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] }
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

async function main() {
  const isFast2SMS = !!process.env.FAST2SMS_API_KEY;
  const isTwilio   = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
  if (!isFast2SMS && !isTwilio && !ACCESS_TOKEN) {
    console.error('ERROR: Either FAST2SMS_API_KEY, TWILIO_ACCOUNT_SID, or WHATSAPP_ACCESS_TOKEN must be set in .env!');
    process.exit(1);
  }

  const providerName = isFast2SMS ? 'Fast2SMS (SMS)' : isTwilio ? 'Twilio (WhatsApp)' : 'Meta Cloud API (WhatsApp)';
  console.log(`\n=== FIELDWATT OUTREACH SEND (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) — Provider: ${providerName} ===`);
  console.log(`Phone ID: ${PHONE_ID}`);
  console.log(`Template: ${TEMPLATE_NAME} (${LANG_CODE})`);
  console.log(`Pace: 1 message every ${PACE_MS}ms\n`);

  // Get active cycle
  const cycleRes = await db.query("SELECT id, name FROM cycles WHERE is_active = 1 LIMIT 1");
  const cycle = cycleRes.rows[0];
  if (!cycle) { console.error('No active cycle found!'); process.exit(1); }
  console.log(`Active cycle: ${cycle.name} (${cycle.id})\n`);

  // Get properties with a phone_number set that haven't been successfully sent yet
  const propsRes = await db.query(`
    SELECT p.id, p.consumer_name, p.phone_number, asg.id as assignment_id
    FROM properties p
    LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = ?
    WHERE p.phone_number IS NOT NULL AND p.phone_number != ''
    AND p.id NOT IN (
      SELECT DISTINCT property_id FROM whatsapp_logs
      WHERE status IN ('sent', 'delivered', 'read')
    )
    ORDER BY p.consumer_name
    LIMIT ?
  `, [cycle.id, BATCH_SIZE]);

  const candidates = propsRes.rows;
  console.log(`Found ${candidates.length} properties not yet contacted this month (capped at ${BATCH_SIZE})\n`);

  if (candidates.length === 0) {
    console.log('All eligible properties have already been contacted! Nothing to send.');
    process.exit(0);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const prop = candidates[i];
    const rawPhone = prop.phone_number;

    if (!rawPhone || !String(rawPhone).trim()) {
      console.log(`[${i+1}/${candidates.length}] SKIP — no phone: ${prop.consumer_name}`);
      skipped++;
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 12 || phone.length > 13) {
      console.log(`[${i+1}/${candidates.length}] SKIP — bad phone "${phone}": ${prop.consumer_name}`);
      skipped++;
      continue;
    }

    const token = jwt.sign(
      { propertyId: prop.id, assignmentId: prop.assignment_id || null },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const result = await sendOne(phone, prop.consumer_name || 'Customer', token);

    if (result.ok) {
      sent++;
      console.log(`[${i+1}/${candidates.length}] ✓ SENT   — ${phone} — ${prop.consumer_name} (wamid: ${result.wamid})`);
      if (!DRY_RUN) {
        await db.query(
          `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, wamid) VALUES (?, ?, ?, ?, 'sent', ?, ?)`,
          [prop.id, phone, prop.consumer_name, token, cycle.id, result.wamid]
        );
      }
    } else {
      failed++;
      console.log(`[${i+1}/${candidates.length}] ✗ FAIL   — ${phone} — ${prop.consumer_name} — ${result.error}`);
      if (!DRY_RUN) {
        await db.query(
          `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, error_message) VALUES (?, ?, ?, ?, 'failed', ?, ?)`,
          [prop.id, phone, prop.consumer_name, token, cycle.id, result.error]
        );
      }
    }

    // Pace: wait before next message (skip in dry run and after last one)
    if (!DRY_RUN && i < candidates.length - 1) await sleep(PACE_MS);
  }

  console.log('\n=== DONE ===');
  console.log(`Total: ${candidates.length} | Sent: ${sent} | Failed: ${failed} | Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
