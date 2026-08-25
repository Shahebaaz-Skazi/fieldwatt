/**
 * scripts/diagnose-delivery.js
 *
 * Runs E2E diagnostics on phone binding, WABA phone numbers, template configurations,
 * and confirms webhook registration status.
 */
require('dotenv').config();

const phoneId = '1346469295207654';
const wabaId = '28001372939505453';
const token = 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';

async function run() {
  console.log('====================================================');
  console.log('     WHATSAPP DELIVERY DIAGNOSTIC AND CONFIG AUDIT  ');
  console.log('====================================================');

  // Step 1: Query Phone ID Binding
  const phoneUrl = `https://graph.facebook.com/v18.0/${phoneId}?fields=display_phone_number,verified_name,status,is_pin_enabled,throughput`;
  console.log(`\n1. Querying Phone Number ID ${phoneId} Binding:`);
  try {
    const res = await fetch(phoneUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Phone Binding Response:');
    console.log(JSON.stringify(data, null, 2));

    if (res.ok) {
      const isRealNum = data.display_phone_number && data.display_phone_number.replace(/\s+/g, '').includes('9175136960');
      console.log(`\n👉 PHONE BINDING CONFIRMATION:`);
      if (isRealNum) {
        console.log(`✅ Success: Phone ID ${phoneId} is correctly bound to your real SIM (+91 91751 36960).`);
      } else {
        console.log(`⚠️ Warning: Phone ID is bound to a different number: ${data.display_phone_number}.`);
      }
    }
  } catch (err) {
    console.error('Failed to query phone binding:', err.message);
  }

  // Step 2: Query All Phone Numbers for this WABA
  const wabaPhonesUrl = `https://graph.facebook.com/v18.0/${wabaId}/phone_numbers`;
  console.log(`\n2. Querying All Phone Numbers under WABA ID ${wabaId}:`);
  try {
    const res = await fetch(wabaPhonesUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('WABA Phone Numbers List:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to query WABA phone numbers:', err.message);
  }

  // Step 3: Query Template Configuration & Category
  const templateUrl = `https://graph.facebook.com/v18.0/${wabaId}/message_templates?name=meter_reading_request`;
  console.log(`\n3. Querying Template "meter_reading_request" Configuration:`);
  try {
    const res = await fetch(templateUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Template Definition:');
    console.log(JSON.stringify(data, null, 2));

    if (res.ok && data.data && data.data[0]) {
      const template = data.data[0];
      console.log(`\n👉 TEMPLATE MATCH SUMMARY:`);
      console.log(`  - Registered Category : ${template.category}`);
      console.log(`  - Registered Language : ${template.language}`);
      console.log(`  - Parameter format    : ${template.parameter_format}`);
    }
  } catch (err) {
    console.error('Failed to query template status:', err.message);
  }

  // Step 4: Webhook Mount verification
  console.log('\n4. Verifying webhook registration in index.js...');
  const fs = require('fs');
  const path = require('path');
  const indexPath = path.join(__dirname, '../src/index.js');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    if (indexContent.includes('/whatsapp-webhook')) {
      console.log('✅ Webhook route (/whatsapp-webhook) is correctly mounted in backend server.');
    } else {
      console.log('❌ Webhook route (/whatsapp-webhook) is missing from backend server configuration.');
    }
  }

  console.log('\n====================================================');
  console.log('             VERIFICATION COMPLETED                 ');
  console.log('====================================================');
}

run();
