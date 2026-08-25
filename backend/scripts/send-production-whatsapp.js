/**
 * scripts/send-production-whatsapp.js
 *
 * Logs in to the live production Render server as admin,
 * and calls the bulk-send endpoint to trigger a message from the server itself.
 * This guarantees the JWT token is signed with the correct production JWT_SECRET.
 */
const backendUrl = 'https://fieldwatt-backend.onrender.com';
const email = 'admin@fieldwatt.com';
const password = 'password123';
const propertyId = '507298b6-c34a-4ecb-98d8-7acdddfa2ce9';

async function run() {
  console.log('====================================================');
  console.log('       SEND WHATSAPP MESSAGE FROM PRODUCTION        ');
  console.log('====================================================');

  // Step 1: Login to get token
  console.log(`\n1. Authenticating with production server at ${backendUrl}...`);
  let token;
  try {
    const res = await fetch(`${backendUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    token = data.token;
    console.log('✅ Authenticated successfully! Admin token received.');
  } catch (err) {
    console.error('❌ Authentication failed:', err.message);
    return;
  }

  // Step 2: Trigger WhatsApp Send from Production
  console.log(`\n2. Triggering WhatsApp send for propertyId ${propertyId}...`);
  try {
    const res = await fetch(`${backendUrl}/admin/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        propertyIds: [propertyId],
        phoneNumbers: {
          [propertyId]: process.argv[2] || '9922421208'
        }
      })
    });
    const data = await res.json();
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    console.log('Production Response:');
    console.log(JSON.stringify(data, null, 2));

    if (res.ok && data.sent > 0) {
      console.log('\n✅ SUCCESS: Message sent successfully from production server!');
    } else {
      console.log('\n❌ FAILED: Production server failed to dispatch the message.');
    }
  } catch (err) {
    console.error('❌ Failed to trigger send:', err.message);
  }
}

run();
