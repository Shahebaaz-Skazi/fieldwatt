/**
 * Fast2SMS Live Test Script
 * Use this script to test sending a real SMS to a specific phone number using Fast2SMS API.
 */
require('dotenv').config();

function format10DigitPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return d;
}

async function sendTestSMS(phone, name) {
  const fast2smsKey = process.env.FAST2SMS_API_KEY;

  if (!fast2smsKey) {
    console.error('❌ FAST2SMS_API_KEY is missing in backend/.env!');
    process.exit(1);
  }

  const tenDigit = format10DigitPhone(phone);
  const readingUrl = 'https://fieldwatt.vercel.app/self-reading?token=TEST_TOKEN';
  
  const route = process.env.FAST2SMS_ROUTE || 'q';
  const messageTemplate = process.env.FAST2SMS_MESSAGE_TEMPLATE;
  const messageText = messageTemplate
    ? messageTemplate.replace('{{name}}', name || 'Customer').replace('{{url}}', readingUrl)
    : `Hello ${name || 'Customer'}, please submit your electricity meter reading using this link: ${readingUrl}`;

  console.log(`\n=== FAST2SMS TEST DISPATCH ===`);
  console.log(`To Phone:  ${tenDigit} (original: ${phone})`);
  console.log(`Route:     ${route}`);
  console.log(`Message:   ${messageText}\n`);

  const reqBody = {
    route: route,
    message: messageText,
    numbers: tenDigit
  };

  if (process.env.FAST2SMS_SENDER_ID) reqBody.sender_id = process.env.FAST2SMS_SENDER_ID;
  if (process.env.FAST2SMS_TEMPLATE_ID) reqBody.template_id = process.env.FAST2SMS_TEMPLATE_ID;

  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': fast2smsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
    });

    const body = await res.text();
    console.log('API Response Status:', res.status);
    console.log('API Response Body:  ', body);

    let resJson = {};
    try { resJson = JSON.parse(body); } catch {}

    if (!res.ok || resJson.return === false) {
      console.error('❌ FAST2SMS FAILED:', resJson.message);
    } else {
      console.log('✅ FAST2SMS SUCCESS! Request ID:', resJson.request_id || resJson.message);
    }
  } catch (err) {
    console.error('❌ Request Error:', err.message);
  }
}

const targetPhone = process.argv[2] || '9175136960';
const targetName = process.argv[3] || 'White Devil';

sendTestSMS(targetPhone, targetName).finally(() => process.exit(0));
