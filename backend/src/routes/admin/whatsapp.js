const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../../db');
const { requireAdmin } = require('../../middleware/roleGuard');

// POST /admin/whatsapp/send-bulk (also support /send)
router.post(['/send', '/send-bulk'], requireAdmin, async (req, res, next) => {
  try {
    let propertyIds = req.body.propertyIds || req.body.property_ids;
    if (!propertyIds && Array.isArray(req.body)) {
      propertyIds = req.body;
    }
    const phoneNumbers = req.body.phoneNumbers || req.body.phone_numbers || {};
    const cycleId = req.body.cycleId || req.body.cycle_id;

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ error: 'propertyIds array is required and cannot be empty.' });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
    const origin = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';
    
    // Meta API configuration
    const phoneIdVal = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const finalPhoneId = phoneIdVal || '1155780700962650';

    const tokenVal = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateVal = process.env.WHATSAPP_TEMPLATE_NAME || 'meter_reading_request';
    const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    console.log('--- WHATSAPP SEND OUTBOUND TRIGGERED ---');
    console.log(`Incoming request body - propertyIds count: ${propertyIds.length}, cycleId: ${cycleId}`);
    console.log(`JWT_SECRET configured: ${!!process.env.JWT_SECRET}`);
    console.log(`WHATSAPP_ACCESS_TOKEN configured (length): ${(process.env.WHATSAPP_ACCESS_TOKEN || '').length}`);
    console.log(`WHATSAPP_PHONE_NUMBER_ID configured: ${!!process.env.WHATSAPP_PHONE_NUMBER_ID} (value: ${finalPhoneId})`);
    console.log(`WHATSAPP_TEMPLATE_NAME: ${templateVal}`);
    console.log(`WHATSAPP_TEMPLATE_LANG: ${langCode}`);

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const propertyId of propertyIds) {
      try {
        // Query property details + assignment_id for this cycle
        const propRes = await db.query(
          `SELECT p.*, asg.id AS assignment_id
           FROM properties p
           LEFT JOIN assignments asg ON asg.property_id = p.id ${cycleId ? 'AND asg.cycle_id = $2' : ''}
           WHERE p.id = $1`,
          cycleId ? [propertyId, cycleId] : [propertyId]
        );

        const property = propRes.rows[0];
        if (!property) {
          results.push({ propertyId, status: 'failed', error: 'Property not found' });
          failedCount++;
          continue;
        }

        // Determine phone number
        let rawPhone = phoneNumbers[propertyId] || property.phone_number || (
          property.raw_sap_data ? (
            property.raw_sap_data['Mobile No.'] ||
            property.raw_sap_data['Mobile'] ||
            property.raw_sap_data['Telephone No.'] ||
            property.raw_sap_data['Telephone'] ||
            property.raw_sap_data['Phone'] ||
            property.raw_sap_data['Contact No']
          ) : null
        );

        if (!rawPhone || !rawPhone.toString().trim()) {
          console.warn(`[whatsapp] Skip propertyId ${propertyId}: No phone number available`);
          results.push({ propertyId, status: 'failed', error: 'No phone number available' });
          failedCount++;
          continue;
        }

        // Format phone number strictly to 91XXXXXXXXXX
        let cleanPhone = rawPhone.toString().replace(/\D/g, '');
        // If it starts with 0, strip it
        if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
          cleanPhone = cleanPhone.substring(1);
        }
        // If it's a 10-digit number, prepend 91 (India country code)
        if (cleanPhone.length === 10) {
          cleanPhone = '91' + cleanPhone;
        }

        // Validate final format: must be at least 10 digits and at most 15 digits
        if (cleanPhone.length < 10 || cleanPhone.length > 15) {
          console.warn(`[whatsapp] Skip propertyId ${propertyId}: Invalid formatted phone number: ${cleanPhone} (raw: ${rawPhone})`);
          results.push({ propertyId, status: 'failed', error: `Invalid phone format: ${cleanPhone}` });
          failedCount++;
          continue;
        }

        const formattedPhone = cleanPhone;

        // If phone number was updated via prompt, save it back to properties table
        if (phoneNumbers[propertyId] && phoneNumbers[propertyId] !== property.phone_number) {
          await db.query('UPDATE properties SET phone_number = $1 WHERE id = $2', [rawPhone, propertyId]);
        }

        // Generate signed JWT token containing { propertyId, expiresAt: '30d' } and assignmentId
        const token = jwt.sign(
          {
            propertyId,
            assignmentId: property.assignment_id || null,
            expiresAt: '30d'
          },
          secret,
          { expiresIn: '30d' }
        );

        const selfReadingUrl = `${origin}/self-reading?token=${token}`;

        let status = 'sent';
        let apiError = null;

        // Call Meta Cloud API
        const metaRes = await fetch(
          `https://graph.facebook.com/v18.0/${finalPhoneId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenVal}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: formattedPhone,
              type: 'template',
              template: {
                name: templateVal,
                language: { code: langCode },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', parameter_name: 'customer_name', text: property.consumer_name }
                    ]
                  },
                  {
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [
                      { type: 'text', text: token }
                    ]
                  }
                ]
              }
            })
          }
        );

        let wamid = null;
        if (!metaRes.ok) {
          const errorText = await metaRes.text();
          console.error('META API EXACT ERROR:', errorText);
          console.error('Meta API Error Details:', errorText);
          let errData = {};
          try {
            errData = JSON.parse(errorText);
          } catch {}
          status = 'failed';
          apiError = errData.error ? errData.error.message : 'Meta WhatsApp API error';
        } else {
          const successText = await metaRes.text();
          try {
            const successData = JSON.parse(successText);
            if (successData.messages && successData.messages[0]) {
              wamid = successData.messages[0].id;
            }
          } catch {}
        }

        // Insert into whatsapp_logs
        await db.query(
          `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, token, status, cycle_id, wamid, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [propertyId, formattedPhone, property.consumer_name, token, status, cycleId || null, wamid, apiError]
        );

        if (status === 'sent') {
          sentCount++;
        } else {
          failedCount++;
        }

        results.push({ propertyId, phone: formattedPhone, status, error: apiError, url: selfReadingUrl });

      } catch (err) {
        failedCount++;
        console.error(`[whatsapp] Exception occurred while sending to propertyId ${propertyId}:`, err.message, err.stack);
        results.push({ propertyId, status: 'failed', error: err.message });
      }
    }

    res.json({ sent: sentCount, failed: failedCount, results });
  } catch (error) {
    console.error('CRITICAL WHATSAPP SERVICE ERROR:', error.message, error.stack);
    res.status(500).json({ error: error.message, detail: error.stack });
  }
});

// GET /admin/whatsapp/status (also support /usage)
router.get(['/usage', '/status'], requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT COUNT(*) as total_sent 
      FROM whatsapp_logs 
      WHERE sent_at >= date_trunc('month', NOW())
      AND status = 'sent'
    `);
    const sentThisMonth = parseInt(result.rows[0].total_sent || 0, 10);
    res.json({ sentThisMonth, count: sentThisMonth, limit: 1000 });
  } catch (error) {
    next(error);
  }
});

// GET /admin/whatsapp/logs
router.get('/logs', requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, property_id, phone_number, consumer_name, status, sent_at, cycle_id
      FROM whatsapp_logs
      ORDER BY sent_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/whatsapp/generate-token
router.get('/generate-token', async (req, res, next) => {
  try {
    const resProp = await db.query(`
      SELECT p.id as property_id, asg.id as assignment_id
      FROM properties p
      LEFT JOIN assignments asg ON asg.property_id = p.id
      LIMIT 1
    `);

    if (resProp.rows.length === 0) {
      return res.status(404).json({ error: 'No properties/assignments found in DB' });
    }

    const { property_id, assignment_id } = resProp.rows[0];
    const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';

    const token = jwt.sign(
      {
        propertyId: property_id,
        assignmentId: assignment_id,
        expiresAt: '30d'
      },
      secret,
      { expiresIn: '30d' }
    );

    const origin = process.env.CUSTOMER_PORTAL_URL || 'https://fieldwatt.vercel.app';
    const selfReadingUrl = `${origin}/self-reading?token=${token}`;

    res.json({ url: selfReadingUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
