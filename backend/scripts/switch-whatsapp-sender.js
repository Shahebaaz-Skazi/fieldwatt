/**
 * scripts/switch-whatsapp-sender.js
 *
 * Automates switching WhatsApp sender configurations:
 * 1. Subscribes the app to the new WABA.
 * 2. Checks template availability, and copies/creates the template if missing.
 * 3. Runs a test message dispatch.
 */
require('dotenv').config();

const wabaId = '1673727163718003';
const phoneId = '1368056309720258';
const token = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAlJzQmfZAjIBSTipKyZCyb4rrSDBZBgUb2Wvl0YIuwds7IH3VvY9WZCFvpY7JsR4enHUU8AxikZBXgRtqnjM3EY4AZBZCH22ruN11LGE8t6d1YNomitc0nrq8qcU1QrzggUZBZCiS5wttnuQXqX14NZACw3oeUH1vNcWKjhYR4bfrf9uXq11S6KCe1ZCiJTPZBhJZBfePgZDZD';

async function run() {
  console.log('====================================================');
  console.log('         SWITCHING WHATSAPP SENDER & WABA           ');
  console.log('====================================================');

  // Step 1: Subscribe the app
  const subscribeUrl = `https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`;
  console.log(`\n1. Subscribing App to WABA ID ${wabaId}...`);
  try {
    const res = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    console.log('Subscribe Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to subscribe:', err.message);
  }

  // Step 2: Check template availability
  const checkTemplateUrl = `https://graph.facebook.com/v18.0/${wabaId}/message_templates?name=meter_reading_request`;
  console.log(`\n2. Checking template "meter_reading_request" on WABA ID ${wabaId}...`);
  let templateExists = false;
  try {
    const res = await fetch(checkTemplateUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    
    if (res.ok && data.data && data.data.length > 0) {
      console.log('✅ Template found:', JSON.stringify(data.data[0], null, 2));
      templateExists = true;
    } else {
      console.log('⚠️ Template not found or error:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Failed to check template:', err.message);
  }

  // Step 3: Create template if missing
  if (!templateExists) {
    const createTemplateUrl = `https://graph.facebook.com/v18.0/${wabaId}/message_templates`;
    console.log(`\n3. Creating template "meter_reading_request" in WABA ID ${wabaId}...`);
    
    const templateBody = {
      name: 'meter_reading_request',
      category: 'UTILITY',
      language: 'en',
      components: [
        {
          type: 'HEADER',
          format: 'TEXT',
          text: 'Message From Maharashtra Natural Gas LTD'
        },
        {
          type: 'BODY',
          text: 'Dear {{customer_name}},\n\nSubmit your monthly MNGL gas meter reading in two simple steps:\n1. Click the secure link below to open your pre-filled form.\n2. Enter your current meter digits and upload a clear photo of the meter dial.\n\nPlease complete this to ensure accurate billing for your current cycle.',
          example: {
            body_text_named_params: [
              {
                param_name: 'customer_name',
                example: 'Amit Thakur'
              }
            ]
          }
        },
        {
          type: 'FOOTER',
          text: 'Maharashtra Natural Gas Limited'
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Submit Meter Reading',
              url: 'https://fieldwatt.vercel.app/self-reading?token={{1}}',
              example: [
                'https://fieldwatt.vercel.app/self-reading?token=sample_token_xyz'
              ]
            }
          ]
        }
      ]
    };

    try {
      const res = await fetch(createTemplateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateBody)
      });
      const data = await res.json();
      console.log(`Status Code: ${res.status} ${res.statusText}`);
      console.log('Create Template Response:', JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to create template:', err.message);
    }
  }

  // Step 4: Dispatch test message
  console.log(`\n4. Dispatching E2E test message...`);
  // Note: We use process.argv[2] or default to +91 84468 12734
  const targetPhone = process.argv[2] || '918446812734';
  const testMsgUrl = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  
  const testPayload = {
    messaging_product: 'whatsapp',
    to: targetPhone,
    type: 'template',
    template: {
      name: 'meter_reading_request',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: 'customer_name',
              text: 'CHINMAY HARPANKAR'
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
              text: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9wZXJ0eUlkIjoiNTA3Mjk4YjYtYzM0YS00ZWNiLTk4ZDgtN2FjZGRkZmEyY2U5IiwiYXNzaWdubWVudElkIjpudWxsLCJleHBpcmVzQXQiOiIzMGQiLCJpYXQiOjE3ODc2NDM0MDYsImV4cCI6MTc5MDIzNTQwNn0.pgcZuEnDWiF8I-Yj1itz-7uxKMIrdUw9UmJDJHB3GFs'
            }
          ]
        }
      ]
    }
  };

  try {
    const res = await fetch(testMsgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });
    const data = await res.json();
    console.log(`Status Code: ${res.status} ${res.statusText}`);
    console.log('Test Dispatch Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to send test message:', err.message);
  }
}

run();
