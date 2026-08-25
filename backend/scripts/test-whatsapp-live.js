/**
 * scripts/test-whatsapp-live.js
 *
 * Standalone diagnostic script to test WhatsApp Meta Graph API live integration.
 * Picks a test property from D1, generates a real self-reading link JWT token,
 * formats the phone number, and sends the template message via Meta Graph API.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../src/db');

async function run() {
  console.log('====================================================');
  console.log('         WHATSAPP OUTBOUND SERVICE DIAGNOSTIC       ');
  console.log('====================================================');

  // Load environment variables
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1346469295207654';
  const token = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'meter_reading_request';
  const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
  const origin = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';

  // 1. Fetch a property from D1
  console.log('Fetching a test property from D1...');
  const propRes = await db.query('SELECT p.*, asg.id AS assignment_id FROM properties p LEFT JOIN assignments asg ON asg.property_id = p.id WHERE p.phone_number IS NOT NULL AND p.phone_number != \'\' LIMIT 1');
  const property = propRes.rows[0];

  if (!property) {
    console.error('❌ ERROR: No properties with phone numbers found in D1 database!');
    process.exit(1);
  }

  // Allow command line argument override for target phone
  const overridePhone = process.argv[2];
  let rawPhone = overridePhone || property.phone_number;
  let formattedPhone = rawPhone.toString().replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = '91' + formattedPhone;
  }

  const consumerName = property.consumer_name || 'DIAGNOSTIC TEST USER';
  console.log(`Target Property : ${property.id}`);
  console.log(`Consumer Name   : ${consumerName}`);
  console.log(`Target Phone    : ${formattedPhone} (original: ${rawPhone})`);
  console.log(`Phone ID        : ${phoneId}`);
  console.log(`Template Name   : ${templateName}`);
  console.log(`Lang Code       : ${langCode}`);

  // 2. Generate signed JWT token
  const jwtToken = jwt.sign(
    {
      propertyId: property.id,
      assignmentId: property.assignment_id || null,
      expiresAt: '30d'
    },
    secret,
    { expiresIn: '30d' }
  );

  // 3. Construct Meta payload using mapped parameter_name for body
  const payload = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: langCode },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: 'customer_name',
              text: consumerName
            }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            {
              type: 'text',
              text: jwtToken
            }
          ]
        }
      ]
    }
  };

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  console.log(`\nOutgoing Payload to: ${url}`);
  console.log(JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`\nResponse Status: ${res.status} ${res.statusText}`);
    const resText = await res.text();
    console.log('Response Body:');
    try {
      console.log(JSON.stringify(JSON.parse(resText), null, 2));
    } catch {
      console.log(resText);
    }

    if (res.status === 200) {
      console.log('\n✅ SUCCESS: WhatsApp message sent successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ FAILURE: Meta API returned an error.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n💥 Network Error:', err.message);
    process.exit(1);
  }
}

run();
