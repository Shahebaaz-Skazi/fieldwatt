/**
 * scripts/verify-whatsapp-setup.js
 *
 * Standalone diagnostic script to inspect Meta WhatsApp configurations:
 * 1. Checks phone number E.164 formatting logic.
 * 2. Fetches phone number metadata, quality rating, and status from Meta Graph API.
 * 3. Fetches Meta App mode / namespace info.
 * 4. Checks local codebase for webhook configurations.
 */
require('dotenv').config();

const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1346469295207654';
const token = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAlJzQmfZAjIBSQf7sTaDtZBZCEZCp6lY2K1BxSyNMwutvZAo4FWX2YdkhtBDwVZB75ZCV3RCYCwFzV01GEEelQwbqynVKz3UMseQp1PWkzL5wuB5mZBPGi8vMun7cPXcBoEJcZAfQZC2DhvJDYH3B9Hodfw1ZCcqlup0OZCXtZAWgQPFr50w70aMCwcp2S4aPX7gtBZBVjgZDZD';

async function run() {
  console.log('====================================================');
  console.log('       META WHATSAPP ACCOUNT SETUP VERIFICATION     ');
  console.log('====================================================');

  // 1. Phone number formatting check
  const testNumbers = [
    '+91 84468 12734',
    '8446812734',
    '08446812734',
    '91 84468 12734',
    '+91-84468-12734'
  ];

  console.log('1. Testing Phone Number Formatting Logic (E.164 check):');
  for (const num of testNumbers) {
    let clean = num.toString().replace(/\D/g, '');
    if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.substring(1);
    }
    if (clean.length === 10) {
      clean = '91' + clean;
    }
    const isValid = clean.length === 12 && clean.startsWith('91');
    console.log(`  - Input: "${num}" => Cleaned: "${clean}" | Valid E.164: ${isValid ? '✅ YES' : '❌ NO'}`);
  }

  // 2. Fetch Phone Number details from Meta API
  console.log('\n2. Fetching Phone Number details from Meta API...');
  const phoneUrl = `https://graph.facebook.com/v18.0/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type,throughput`;
  try {
    const res = await fetch(phoneUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`  - Status Code: ${res.status}`);
    if (res.ok) {
      console.log('  - Phone Metadata:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('  - Meta Phone API Error:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('  - Failed to call Phone API:', err.message);
  }

  // 3. Fetch App/Business details
  console.log('\n3. Fetching Meta App/Business details...');
  const meUrl = `https://graph.facebook.com/v18.0/me?fields=id,name`;
  try {
    const res = await fetch(meUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`  - Status Code: ${res.status}`);
    if (res.ok) {
      console.log('  - App/Business Metadata:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('  - Meta App API Error:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('  - Failed to call App API:', err.message);
  }

  // 4. Codebase Webhook scan
  console.log('\n4. Checking Webhook listener routes in codebase...');
  const fs = require('fs');
  const path = require('path');
  const routesDir = path.join(__dirname, '../src/routes');
  
  let webhookFound = false;
  if (fs.existsSync(routesDir)) {
    const scanDir = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('webhook') || content.includes('/webhook')) {
            webhookFound = true;
            console.log(`  ✅ Found potential webhook listener in file: ${path.relative(__dirname, fullPath)}`);
          }
        }
      }
    };
    try {
      scanDir(routesDir);
    } catch (e) {
      console.error('Error scanning routes directory:', e.message);
    }
  }

  if (!webhookFound) {
    console.log('  ❌ NO Webhook listeners found in backend codebase.');
    console.log('  💡 Recommendation: You need to implement a POST webhook listener (e.g. `/api/whatsapp/webhook`) to capture Meta delivery status callback events.');
  }

  console.log('\n====================================================');
  console.log('             VERIFICATION COMPLETED                 ');
  console.log('====================================================');
}

run();
