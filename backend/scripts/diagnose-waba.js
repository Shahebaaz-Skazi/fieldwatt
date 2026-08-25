/**
 * scripts/diagnose-waba.js
 *
 * Runs WABA checks:
 * 1. Subscribes the app to the WABA account.
 * 2. Queries WABA details (review status, billing, etc.).
 * 3. Checks template approval status.
 */
require('dotenv').config();

const wabaId = '122111142945434786';
const token = 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';

async function run() {
  console.log('====================================================');
  console.log('       META WABA ACCOUNT SETUP DIAGNOSTICS          ');
  console.log('====================================================');

  // Step 1: Subscribe the App
  const subscribeUrl = `https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`;
  console.log(`\n1. Subscribing App to WABA: ${subscribeUrl}`);
  try {
    const res = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Subscribe Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to subscribe app:', err.message);
  }

  // Step 2: Check WABA Account Status & Restrictions
  const wabaUrl = `https://graph.facebook.com/v18.0/${wabaId}?fields=account_review_status,business_verification_status,currency,primary_funding_id,purchase_order_number,name`;
  console.log(`\n2. Querying WABA Account Status: ${wabaUrl}`);
  try {
    const res = await fetch(wabaUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('WABA Status Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to check WABA status:', err.message);
  }

  // Step 3: Check Template Approval Status
  const templateUrl = `https://graph.facebook.com/v18.0/${wabaId}/message_templates?name=meter_reading_request`;
  console.log(`\n3. Querying Template Status: ${templateUrl}`);
  try {
    const res = await fetch(templateUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Template Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to check template status:', err.message);
  }
}

run();
