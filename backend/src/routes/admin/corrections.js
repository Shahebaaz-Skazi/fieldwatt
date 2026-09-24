const express = require('express');
const router = express.Router();
const db = require('../../utils/db');

// GET pending corrections
router.get('/', async (req, res) => {
  try {
    // Only return 1 at a time to prevent collisions if multiple admins are correcting
    const result = await db.query(`
      SELECT rc.reading_id, rc.serial_no, rc.original_value, rc.photo_url, rc.status,
             p.consumer_name, p.address, p.meter_no,
             a.name as agent_name
      FROM reading_corrections rc
      JOIN readings r ON rc.reading_id = r.id
      JOIN assignments asg ON r.assignment_id = asg.id
      JOIN properties p ON asg.property_id = p.id
      LEFT JOIN agents a ON asg.agent_id = a.id
      WHERE rc.status = 'pending'
      ORDER BY rc.serial_no ASC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.json({ message: 'No corrections pending', data: null });
    }
    
    // Check total remaining
    const countRes = await db.query(`SELECT COUNT(*) as total FROM reading_corrections WHERE status = 'pending'`);
    
    res.json({
      data: result.rows[0],
      remaining: countRes.rows[0].total
    });
  } catch (err) {
    console.error('Error fetching corrections:', err);
    res.status(500).json({ error: 'Failed to fetch correction' });
  }
});

// POST submit correction
router.post('/:reading_id', async (req, res) => {
  const { reading_id } = req.params;
  const { corrected_value } = req.body;
  
  if (corrected_value === undefined || corrected_value === null || corrected_value === '') {
    return res.status(400).json({ error: 'corrected_value is required' });
  }

  try {
    // 1. Update the readings table
    await db.query(`
      UPDATE readings 
      SET reading_value = $1, is_synced = 1
      WHERE id = $2
    `, [corrected_value, reading_id]);
    
    // 2. Mark reading_corrections as 'corrected'
    await db.query(`
      UPDATE reading_corrections
      SET status = 'corrected'
      WHERE reading_id = $1
    `, [reading_id]);
    
    res.json({ success: true, message: 'Reading corrected successfully' });
  } catch (err) {
    console.error('Error submitting correction:', err);
    res.status(500).json({ error: 'Failed to submit correction' });
  }
});

// DELETE / Skip correction (marks as skipped if they can't decide)
router.post('/:reading_id/skip', async (req, res) => {
  const { reading_id } = req.params;
  try {
    await db.query(`
      UPDATE reading_corrections
      SET status = 'skipped'
      WHERE reading_id = $1
    `, [reading_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to skip correction' });
  }
});

module.exports = router;
