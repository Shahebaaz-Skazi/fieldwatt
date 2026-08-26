/**
 * scripts/send-kot009-outreach.js
 *
 * Direct script to dispatch WhatsApp self-reading requests to all pending
 * properties in Area KOT009_E.
 *
 * Usage:
 *   node scripts/send-kot009-outreach.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../src/utils/db');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10)   d = '91' + d;
  return d;
}

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
  console.log('    DISPATCH OUTREACH TO KOT009_E CUSTOMERS        ');
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

  // 1. Get active cycle
  console.log('- Fetching active billing cycle...');
  const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 LIMIT 1');
  if (cycleRes.rows.length === 0) {
    console.error('❌ ERROR: No active cycle found in database.');
    process.exit(1);
  }
  const cycleId = cycleRes.rows[0].id;
  console.log(`  Active cycle: ${cycleId}`);

  // 2. Fetch pending properties in KOT009_E
  console.log('- Fetching pending properties in area KOT009_E...');
  const propsQuery = `
    SELECT p.id, p.consumer_name, p.phone_number, p.raw_sap_data, asg.id AS assignment_id
    FROM properties p
    INNER JOIN areas a ON p.area_id = a.id
    LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
    LEFT JOIN readings r ON r.assignment_id = asg.id
    WHERE a.name LIKE '%KOT009%'
      AND (r.status_code IS NULL OR r.status_code != 'reading_taken')
  `;
  const propsRes = await db.query(propsQuery, [cycleId]);
  const properties = propsRes.rows;
  console.log(`  Found ${properties.length} pending properties.`);

  if (properties.length === 0) {
    console.log('✅ All customers in KOT009_E are already completed or no properties found.');
    process.exit(0);
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  console.log('\n- Starting paced dispatch (~20 messages/sec)...');
  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];

    // Resolve phone number
    const rawPhone = p.phone_number ||
      (p.raw_sap_data
        ? (p.raw_sap_data['Mobile No.'] ||
           p.raw_sap_data['Mobile']      ||
           p.raw_sap_data['Telephone No.']||
           p.raw_sap_data['Telephone']   ||
           p.raw_sap_data['Phone']        ||
           p.raw_sap_data['Contact No'])
        : null);

    if (!rawPhone || !String(rawPhone).trim()) {
      skippedCount++;
      console.log(`[${i+1}/${properties.length}] ⚠️  Skipped ${p.consumer_name} (No phone number)`);
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10 || phone.length > 15) {
      skippedCount++;
      console.log(`[${i+1}/${properties.length}] ⚠️  Skipped ${p.consumer_name} (Invalid phone format: "${phone}")`);
      continue;
    }

    // Sign JWT token
    const token = jwt.sign(
      { propertyId: p.id, assignmentId: p.assignment_id || null },
      secret,
      { expiresIn: '30d' }
    );

    // Send via Meta API
    const res = await sendOneMessage({
      phoneId,
      accessToken,
      templateName,
      langCode,
      phone,
      name: p.consumer_name,
      token
    });

    const status = res.ok ? 'sent' : 'failed';
    const errMsg = res.ok ? null : res.error;

    if (res.ok) {
      sentCount++;
      console.log(`[${i+1}/${properties.length}] ✅ Sent to ${p.consumer_name} (${phone})`);
    } else {
      failedCount++;
      console.error(`[${i+1}/${properties.length}] ❌ Failed for ${p.consumer_name} (${phone}): ${errMsg}`);
    }

    // Log to D1
    await db.query(
      `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.id, phone, p.consumer_name, token, status, cycleId, errMsg]
    ).catch(() => {});

    // Pacing delay: 100ms between individual messages
    await sleep(100);
  }

  console.log('\n====================================================');
  console.log('                 DISPATCH SUMMARY                  ');
  console.log('====================================================');
  console.log(`  Total Properties: ${properties.length}`);
  console.log(`  Successfully Sent: ${sentCount}`);
  console.log(`  Failed:            ${failedCount}`);
  console.log(`  Skipped:           ${skippedCount}`);
  console.log('====================================================\n');
}

run().catch(console.error);
