const phoneId = '1346469295207654';
const token = 'EAAlJzQmfZAjIBSQf7sTaDtZBZCEZCp6lY2K1BxSyNMwutvZAo4FWX2YdkhtBDwVZB75ZCV3RCYCwFzV01GEEelQwbqynVKz3UMseQp1PWkzL5wuB5mZBPGi8vMun7cPXcBoEJcZAfQZC2DhvJDYH3B9Hodfw1ZCcqlup0OZCXtZAWgQPFr50w70aMCwcp2S4aPX7gtBZBVjgZDZD';
const templateName = 'meter_reading_request';

async function test(buttonParamName) {
  const buttonParam = {
    type: 'text',
    text: 'test_token_value_xyz'
  };
  if (buttonParamName) {
    buttonParam.parameter_name = buttonParamName;
  }

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
              parameter_name: 'customer_name',
              text: 'DIAGNOSTIC TEST USER'
            }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [buttonParam]
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
    console.log(`\nResults for buttonParamName: ${buttonParamName || 'NONE'}`);
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.log(`Error:`, err.message);
  }
}

async function run() {
  await test(null); // Test without parameter_name for button
  await new Promise(r => setTimeout(r, 500));
  await test('token'); // Test with 'token'
  await new Promise(r => setTimeout(r, 500));
  await test('1'); // Test with '1'
}

run();
