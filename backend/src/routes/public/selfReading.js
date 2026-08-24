const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../../utils/db');
const { uploadBuffer } = require('../../utils/r2Storage');

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
    } catch {
      return res.status(401).json({ error: 'Link expired or invalid' });
    }

    const { propertyId, assignmentId } = decoded;

    // D1 uses ? placeholders (converted automatically by utils/db)
    const result = await db.query(
      `SELECT p.id as property_id, p.consumer_name, p.address, p.meter_no, p.serial_no as bp_no, p.society, a.name as area_name
       FROM properties p
       LEFT JOIN areas a ON a.id = p.area_id
       WHERE p.id = ?`,
      [propertyId]
    );

    const prop = result.rows[0];
    if (!prop) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json({
      consumerName: prop.consumer_name,
      address:      prop.address,
      meterNo:      prop.meter_no     || 'N/A',
      bpNo:         prop.bp_no        || 'N/A',
      areaName:     prop.area_name    || 'N/A',
      society:      prop.society      || 'N/A',
      propertyId:   prop.property_id,
      assignmentId: assignmentId || null,
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
    } catch {
      return res.status(401).json({ error: 'Link expired or invalid' });
    }

    const { propertyId, assignmentId } = decoded;

    // Resolve or create assignment_id if missing
    let finalAssignmentId = assignmentId;
    if (!finalAssignmentId) {
      const asgRes = await db.query(
        'SELECT id FROM assignments WHERE property_id = ? LIMIT 1',
        [propertyId]
      );
      if (asgRes.rows.length > 0) {
        finalAssignmentId = asgRes.rows[0].id;
      } else {
        const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 LIMIT 1');
        const cycleId  = cycleRes.rows[0]?.id;
        if (cycleId) {
          // D1 doesn't support ON CONFLICT DO UPDATE with RETURNING; do INSERT OR IGNORE + SELECT
          await db.query(
            `INSERT OR IGNORE INTO assignments (id, property_id, cycle_id, assigned_at)
             VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), ?, ?, datetime('now'))`,
            [propertyId, cycleId]
          );
          const asgRes2 = await db.query(
            'SELECT id FROM assignments WHERE property_id = ? AND cycle_id = ? LIMIT 1',
            [propertyId, cycleId]
          );
          finalAssignmentId = asgRes2.rows[0]?.id;
        }
      }
    }

    if (!finalAssignmentId) {
      return res.status(400).json({ error: 'Could not resolve assignment for property' });
    }

    // Upload photo to R2 if provided
    let photoUrl = null;
    if (photoBase64) {
      try {
        const cleanBase64 = photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer      = Buffer.from(cleanBase64, 'base64');
        const filename    = `customer_self_readings/${propertyId}_${Date.now()}.jpg`;
        photoUrl          = await uploadBuffer(filename, buffer, photoMimeType || 'image/jpeg');
      } catch (uploadErr) {
        console.error('R2 upload error:', uploadErr);
        // ponytail: don't fail submission if photo upload fails; just store null
      }
    }

    const idempotencyKey = crypto.randomUUID();

    // Insert reading into D1
    await db.query(
      `INSERT INTO readings
       (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, source, submitted_by_type, submitted_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'reading_taken', ?, 'customer_self_reading', 'customer', datetime('now'))`,
      [finalAssignmentId, idempotencyKey, readingValue, photoUrl]
    );

    // Mark WhatsApp outreach as delivered
    await db.query(
      `UPDATE whatsapp_logs SET status = 'delivered' WHERE property_id = ?`,
      [propertyId]
    );

    res.json({ success: true, photoUrl });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
