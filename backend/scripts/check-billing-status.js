/**
 * scripts/check-billing-status.js
 *
 * Diagnostic script to check WhatsApp Phone and WABA Billing status.
 */
require('dotenv').config();

const phoneId = '1346469295207654';
const wabaId = '28001372939505453';
const token = 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';

async function run() {
  console.log('====================================================');
  console.log('       META PHONE & WABA BILLING STATUS CHECK       ');
  console.log('====================================================');

  // Step 1: Query Phone ID details
  const phoneUrl = `https://graph.facebook.com/v18.0/${phoneId}?fields=account_mode,status,quality_rating,code_verification_status`;
  console.log(`\n1. Querying Phone Details: ${phoneUrl}`);
  try {
    const res = await fetch(phoneUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to query phone details:', err.message);
  }

  // Step 2: Query WABA Details
  const wabaUrl = `https://graph.facebook.com/v18.0/${wabaId}?fields=primary_funding_id,account_review_status,message_template_namespace,name`;
  console.log(`\n2. Querying WABA Details: ${wabaUrl}`);
  try {
    const res = await fetch(wabaUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    
    // Step 3: Log billing status
    if (res.ok) {
      const primaryFundingId = data.primary_funding_id;
      console.log('\n--- BILLING STATUS CHECK ---');
      if (!primaryFundingId) {
        console.log('⚠️ WARNING: "primary_funding_id" is NULL or missing!');
        console.log('👉 This indicates that no active Payment Method is linked to this WhatsApp Business Account.');
        console.log('👉 Meta will reject delivery of template messages even if the API returns "accepted" because there is no card associated to pay for utility conversations.');
      } else {
        console.log(`✅ SUCCESS: Active Payment Method found! (primary_funding_id: ${primaryFundingId})`);
      }
    }
  } catch (err) {
    console.error('Failed to query WABA details:', err.message);
  }
}

run();
