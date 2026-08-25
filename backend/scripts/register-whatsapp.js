/**
 * scripts/register-whatsapp.js
 *
 * Registers the WhatsApp Phone Number with Meta Cloud API
 * and checks the status immediately after.
 */
require('dotenv').config();

const phoneId = '1346469295207654';
const token = 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';

async function run() {
  console.log('====================================================');
  console.log('       META WHATSAPP REGISTER PHONE NUMBER DIAG     ');
  console.log('====================================================');

  // Step 1: Call the /register endpoint
  const registerUrl = `https://graph.facebook.com/v18.0/${phoneId}/register`;
  console.log(`\nCalling registration endpoint: ${registerUrl}`);
  
  try {
    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: '123456'
      })
    });

    console.log(`Status Code: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Registration Response:');
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Failed to register:', err.message);
  }

  // Step 2: Check status after registration
  const statusUrl = `https://graph.facebook.com/v18.0/${phoneId}?fields=status,code_verification_status,quality_rating,name_status`;
  console.log(`\nChecking registration status: ${statusUrl}`);
  
  try {
    const res = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    console.log('Status Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to check status:', err.message);
  }
}

run();
