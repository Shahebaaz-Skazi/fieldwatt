/**
 * scripts/send-10-new.js
 *
 * Sends WhatsApp self-reading requests to 10 new, uncontacted KOT009_E customers.
 * Waits 5 seconds after sending to check the live webhook delivery status in D1.
 *
 * Usage:
 *   node scripts/send-10-new.js
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
  console.log('    SENDING & VERIFYING 10 NEW KOT009 CUSTOMERS     ');
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
  const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 LIMIT 1');
  const cycleId = cycleRes.rows[0].id;

  // 2. Fetch 10 uncontacted properties in KOT009_E
  const query = `
    SELECT p.id, p.consumer_name, p.phone_number, p.raw_sap_data, asg.id AS assignment_id
    FROM properties p
    LEFT JOIN whatsapp_logs wl ON p.id = wl.property_id AND wl.cycle_id = $1
    LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
    WHERE p.area_id = '2d39305e-d9f5-4a65-bb61-9d8b7d92f17a'
      AND wl.id IS NULL
    ORDER BY p.consumer_name ASC
    LIMIT 10
  `;
  const propsRes = await db.query(query, [cycleId]);
  const properties = propsRes.rows;

  if (properties.length === 0) {
    console.log('✅ No uncontacted properties found.');
    process.exit(0);
  }

  console.log(`- Attempting to send to ${properties.length} new customers...`);
  const insertedIds = [];

  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];
    let rawSap = {};
    if (typeof p.raw_sap_data === 'string') {
      try { rawSap = JSON.parse(p.raw_sap_data); } catch {}
    } else if (p.raw_sap_data) {
      rawSap = p.raw_sap_data;
    }

    const rawPhone = p.phone_number || rawSap['Mobile No.'] || rawSap['Mobile'] || rawSap['Telephone No.'] || rawSap['Telephone'] || rawSap['Phone'] || rawSap['Contact No'];
    if (!rawPhone) {
      console.log(`[${i+1}/10] ⚠️  Skipped ${p.consumer_name} (No phone)`);
      continue;
    }

    const phone = normalizePhone(rawPhone);
    const token = jwt.sign(
      { propertyId: p.id, assignmentId: p.assignment_id || null },
      secret,
      { expiresIn: '30d' }
    );

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
    const wamid = res.ok ? res.wamid : null;

    if (res.ok) {
      console.log(`[${i+1}/10] ✅ Sent to ${p.consumer_name} (${phone})`);
    } else {
      console.error(`[${i+1}/10] ❌ Failed for ${p.consumer_name}: ${errMsg}`);
    }

    // Insert log row
    const inserted = await db.query(
      `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, error_message, wamid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [p.id, phone, p.consumer_name, token, status, cycleId, errMsg, wamid]
    );

    if (inserted.rows.length > 0) {
      insertedIds.push(inserted.rows[0].id);
    }

    await sleep(200); // Slight pacing
  }

  // 3. Wait 8 seconds to allow Meta status callbacks to trigger
  console.log('\n- Waiting 8 seconds for Meta delivery webhook callbacks...');
  await sleep(8000);

  // 4. Check updated statuses
  console.log('\n- Fetching live delivery status from database:');
  const placeholders = insertedIds.map((_, idx) => `$${idx + 1}`).join(', ');
  const statusRes = await db.query(
    `SELECT consumer_name, phone_number, status, error_message FROM whatsapp_logs WHERE id IN (${placeholders})`,
    insertedIds
  );

  console.log('\nLive Verification Results:');
  statusRes.rows.forEach((row, idx) => {
    const icon = row.status === 'delivered' || row.status === 'read' ? '🟢' : '⚪';
    console.log(`  ${icon} [${idx + 1}] ${row.consumer_name} (${row.phone_number}): Status = [${row.status}]`);
  });
  console.log('\n====================================================\n');
}

run().catch(console.error);
