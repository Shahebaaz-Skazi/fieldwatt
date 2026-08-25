const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /whatsapp-webhook - Meta Webhook Verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('--- WHATSAPP WEBHOOK VERIFICATION ATTEMPT ---');
  console.log('Mode:', mode);
  console.log('Token:', token);
  console.log('Challenge:', challenge);

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'fieldwatt_verify_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ Webhook verification failed: Token mismatch.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// POST /whatsapp-webhook - Receive status updates
router.post('/', async (req, res) => {
  try {
    console.log('--- WHATSAPP WEBHOOK RECEIVED ---');
    console.log(JSON.stringify(req.body, null, 2));

    const entry = req.body.entry;
    if (Array.isArray(entry) && entry[0].changes && entry[0].changes[0].value) {
      const value = entry[0].changes[0].value;
      
      // Look for status updates
      if (Array.isArray(value.statuses) && value.statuses.length > 0) {
        for (const statusObj of value.statuses) {
          const wamid = statusObj.id;
          const status = statusObj.status; // e.g. "sent", "delivered", "read", "failed"
          const recipientPhone = statusObj.recipient_id;
          
          console.log(`[webhook] Message ${wamid} to ${recipientPhone} status updated to: ${status}`);

          let dbStatus = 'sent';
          let errorMessage = null;

          if (status === 'failed') {
            dbStatus = 'failed';
            if (Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
              const err = statusObj.errors[0];
              errorMessage = `Error Code ${err.code}: ${err.message || err.title}`;
              if (err.error_data && err.error_data.details) {
                errorMessage += ` (${err.error_data.details})`;
              }
            } else {
              errorMessage = 'Meta reported failed delivery';
            }
            console.error(`[webhook] Message ${wamid} failed. Error: ${errorMessage}`);
          } else if (status === 'delivered') {
            dbStatus = 'delivered';
          } else if (status === 'read') {
            dbStatus = 'read';
          }

          // Update D1 database table whatsapp_logs
          if (wamid) {
            await db.query(
              `UPDATE whatsapp_logs 
               SET status = $1, error_message = $2 
               WHERE wamid = $3`,
              [dbStatus, errorMessage || null, wamid]
            );
            console.log(`[webhook] Updated database for message ID ${wamid} to status: ${dbStatus}`);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[webhook] Error handling webhook:', error.message, error.stack);
    res.sendStatus(500);
  }
});

module.exports = router;
