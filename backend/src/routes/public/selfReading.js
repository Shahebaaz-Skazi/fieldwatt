const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const db = require('../../db');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

// GET /public/self-reading?token=JWT
router.get('/', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Link expired or invalid' });
    }

    const { propertyId, assignmentId } = decoded;

    const result = await db.query(
      `SELECT p.id as property_id, p.consumer_name, p.address, p.meter_no, p.serial_no as bp_no, p.society, a.name as area_name
       FROM properties p
       LEFT JOIN areas a ON a.id = p.area_id
       WHERE p.id = $1`,
      [propertyId]
    );

    const prop = result.rows[0];
    if (!prop) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json({
      consumerName: prop.consumer_name,
      address: prop.address,
      meterNo: prop.meter_no || 'N/A',
      bpNo: prop.bp_no || 'N/A',
      areaName: prop.area_name || 'N/A',
      society: prop.society || 'N/A',
      propertyId: prop.property_id,
      assignmentId: assignmentId || null
    });
  } catch (error) {
    next(error);
  }
});

// POST /public/self-reading/submit
router.post('/submit', async (req, res, next) => {
  try {
    const { token, readingValue, photoBase64, photoMimeType } = req.body;

    if (!token || !readingValue) {
      return res.status(400).json({ error: 'Token and readingValue are required.' });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Link expired or invalid' });
    }

    const { propertyId, assignmentId } = decoded;

    // Resolve or create assignment_id if missing
    let finalAssignmentId = assignmentId;
    if (!finalAssignmentId) {
      const asgRes = await db.query('SELECT id FROM assignments WHERE property_id = $1 LIMIT 1', [propertyId]);
      if (asgRes.rows.length > 0) {
        finalAssignmentId = asgRes.rows[0].id;
      } else {
        const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
        const cycleId = cycleRes.rows[0]?.id;
        if (cycleId) {
          const newAsg = await db.query(
            `INSERT INTO assignments (property_id, cycle_id)
             VALUES ($1, $2)
             ON CONFLICT (property_id, cycle_id) DO UPDATE SET property_id = EXCLUDED.property_id
             RETURNING id`,
            [propertyId, cycleId]
          );
          finalAssignmentId = newAsg.rows[0].id;
        }
      }
    }

    if (!finalAssignmentId) {
      return res.status(400).json({ error: 'Could not resolve assignment for property' });
    }

    // Upload photo to Supabase if provided
    let photoUrl = null;
    if (photoBase64 && supabase) {
      const cleanBase64 = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const filename = `self_reading_${propertyId}_${Date.now()}.jpg`;
      const storagePath = `customer_self_readings/${filename}`;

      const { data, error: uploadErr } = await supabase.storage
        .from('meter-photos')
        .upload(storagePath, buffer, {
          contentType: photoMimeType || 'image/jpeg',
          upsert: true
        });

      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage
          .from('meter-photos')
          .getPublicUrl(storagePath);
        photoUrl = publicUrlData ? publicUrlData.publicUrl : null;
      } else {
        console.error('Supabase upload error:', uploadErr);
      }
    }

    const idempotencyKey = crypto.randomUUID();

    // Insert into readings table
    await db.query(
      `INSERT INTO readings 
       (assignment_id, idempotency_key, reading_value, status_code, photo_url, source, submitted_by_type, submitted_at)
       VALUES ($1, $2, $3, 'reading_taken', $4, 'customer_self_reading', 'customer', NOW())`,
      [finalAssignmentId, idempotencyKey, readingValue, photoUrl]
    );

    // Update whatsapp_logs status to delivered
    await db.query(
      `UPDATE whatsapp_logs SET status = 'delivered' WHERE property_id = $1`,
      [propertyId]
    );

    res.json({ success: true, photoUrl });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
