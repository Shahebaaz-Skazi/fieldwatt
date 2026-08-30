const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /twilio-webhook - Receive Twilio WhatsApp status updates
router.post('/', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    console.log('--- TWILIO WHATSAPP WEBHOOK RECEIVED ---');
    console.log(req.body);

    const wamid = req.body.MessageSid;
    const status = req.body.MessageStatus; // e.g. "sent", "delivered", "read", "failed"
    const errorCode = req.body.ErrorCode;

    if (!wamid) {
      return res.sendStatus(400);
    }

    console.log(`[twilio-webhook] Message ${wamid} status updated to: ${status}`);

    let dbStatus = 'sent';
    let errorMessage = null;

    if (status === 'failed') {
      dbStatus = 'failed';
      errorMessage = errorCode ? `Twilio Error Code ${errorCode}` : 'Failed delivery';
    } else if (status === 'delivered') {
      dbStatus = 'delivered';
    } else if (status === 'read') {
      dbStatus = 'read';
    } else if (status === 'sent') {
      dbStatus = 'sent';
    }

    // Update D1 database
    await db.query(
      `UPDATE whatsapp_logs 
       SET status = $1, error_message = $2 
       WHERE wamid = $3`,
      [dbStatus, errorMessage, wamid]
    );
    console.log(`[twilio-webhook] Updated database for Twilio SID ${wamid} to status: ${dbStatus}`);

    res.sendStatus(200);
  } catch (error) {
    console.error('[twilio-webhook] Error:', error.message);
    res.sendStatus(500);
  }
});

module.exports = router;
