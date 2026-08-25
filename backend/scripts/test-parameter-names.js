const phoneId = '1346469295207654';
const token = 'EAAlJzQmfZAjIBSQf7sTaDtZBZCEZCp6lY2K1BxSyNMwutvZAo4FWX2YdkhtBDwVZB75ZCV3RCYCwFzV01GEEelQwbqynVKz3UMseQp1PWkzL5wuB5mZBPGi8vMun7cPXcBoEJcZAfQZC2DhvJDYH3B9Hodfw1ZCcqlup0OZCXtZAWgQPFr50w70aMCwcp2S4aPX7gtBZBVjgZDZD';
const templateName = 'meter_reading_request';

const candidateNames = [
  '1',
  'name',
  'customer_name',
  'consumer_name',
  'url',
  'link',
  'self_reading_url',
  'text',
  'body_parameter_1',
  'token'
];

async function test(name) {
  const body = {
    messaging_product: 'whatsapp',
    to: '918446812734',
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: name,
              text: 'DIAGNOSTIC TEST VALUE'
            }
          ]
        }
      ]
    }
  };

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (res.status === 200 || (data.error && data.error.message.includes('structure') === false && data.error.message.includes('missing or empty') === false)) {
      console.log(`✅ Success or specific error for '${name}': Status ${res.status}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ Fail for '${name}': ${data.error ? data.error.message : text}`);
    }
  } catch (err) {
    console.log(`💥 Error for '${name}':`, err.message);
  }
}

async function run() {
  for (const name of candidateNames) {
    await test(name);
    await new Promise(r => setTimeout(r, 500)); // sleep to avoid rate limits
  }
}

run();
