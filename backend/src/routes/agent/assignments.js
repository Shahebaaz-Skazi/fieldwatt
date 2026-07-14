const express = require('express');
const router = express.Router();
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAgent } = require('../../middleware/roleGuard');

// GET /agent/assignments - Get current assigned property list for the logged in agent
router.get('/', authMiddleware, requireAgent, async (req, res, next) => {
  try {
    const agentId = req.user.id;

    // Get active cycle
    const cycleResult = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    if (cycleResult.rows.length === 0) {
      return res.json([]); // Return empty list if no active billing cycle
    }
    const cycleId = cycleResult.rows[0].id;

    let queryText = '';
    let params = [];

    if (req.user.role === 'admin') {
      // Admins see all properties and assignments (capped at 5000 for performance stability)
      queryText = `
        SELECT 
          asg.id as assignment_id,
          p.id as property_id,
          p.serial_no,
          p.consumer_name,
          p.address,
          p.meter_no,
          p.property_type,
          p.lat as property_lat,
          p.lng as property_lng,
          p.society,
          p.raw_sap_data->>'Building (Number or Code)' as building_code,
          ar.name as area_name,
          r.id as reading_id,
          r.reading_value,
          r.status_code as reading_status,
          r.photo_url,
          r.note,
          r.submitted_at as reading_submitted_at
        FROM properties p
        LEFT JOIN areas ar ON ar.id = p.area_id
        LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
        LEFT JOIN readings r ON r.assignment_id = asg.id
        ORDER BY p.serial_no ASC
        LIMIT 5000
      `;
      params = [cycleId];
    } else {
      // Standard agents see only their own assignments
      queryText = `
        SELECT 
          asg.id as assignment_id,
          p.id as property_id,
          p.serial_no,
          p.consumer_name,
          p.address,
          p.meter_no,
          p.property_type,
          p.lat as property_lat,
          p.lng as property_lng,
          p.society,
          p.raw_sap_data->>'Building (Number or Code)' as building_code,
          ar.name as area_name,
          r.id as reading_id,
          r.reading_value,
          r.status_code as reading_status,
          r.photo_url,
          r.note,
          r.submitted_at as reading_submitted_at
        FROM assignments asg
        INNER JOIN properties p ON asg.property_id = p.id
        LEFT JOIN areas ar ON ar.id = p.area_id
        LEFT JOIN readings r ON r.assignment_id = asg.id
        WHERE asg.agent_id = $1 AND asg.cycle_id = $2
        ORDER BY p.serial_no ASC
      `;
      params = [agentId, cycleId];
    }

    const result = await db.query(queryText, params);
    
    if (req.user.role !== 'admin') {
      // Track attendance check-in for the day (agents only)
      await db.query(`
        INSERT INTO attendance (agent_id, date, login_time, last_active)
        VALUES ($1, CURRENT_DATE, NOW(), NOW())
        ON CONFLICT (agent_id, date)
        DO UPDATE SET last_active = NOW()
      `, [agentId]);
    }

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /agent/properties/:id/history - Get last 3 cycles/months history of readings for a property
router.get('/properties/:id/history', authMiddleware, requireAgent, async (req, res, next) => {
  try {
    const propertyId = req.params.id;

    const queryText = `
      SELECT 
        r.id as reading_id,
        r.reading_value,
        r.status_code,
        r.note,
        r.submitted_at,
        c.label as cycle_label
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      INNER JOIN cycles c ON asg.cycle_id = c.id
      WHERE asg.property_id = $1
      ORDER BY r.submitted_at DESC
      LIMIT 3
    `;
    const result = await db.query(queryText, [propertyId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /agent/assignments/nearest?lat=&lng= — returns nearest pending assignment by haversine distance
router.get('/nearest', authMiddleware, requireAgent, async (req, res, next) => {
  try {
    const agentId = req.user.id;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    const cycleResult = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    if (cycleResult.rows.length === 0) return res.json(null);
    const cycleId = cycleResult.rows[0].id;

    // If GPS not available, return first pending assignment by serial_no
    if (isNaN(lat) || isNaN(lng)) {
      const result = await db.query(`
        SELECT asg.id as assignment_id, p.id as property_id, p.serial_no, p.consumer_name, p.address, p.lat as property_lat, p.lng as property_lng
        FROM assignments asg
        INNER JOIN properties p ON p.id = asg.property_id
        LEFT JOIN readings r ON r.assignment_id = asg.id
        WHERE asg.agent_id = $1 AND asg.cycle_id = $2 AND r.id IS NULL
        ORDER BY p.serial_no ASC
        LIMIT 1
      `, [agentId, cycleId]);
      return res.json(result.rows[0] || null);
    }

    // Haversine distance formula in Postgres (result in metres)
    const result = await db.query(`
      SELECT
        asg.id as assignment_id,
        p.id as property_id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.lat as property_lat,
        p.lng as property_lng,
        (
          6371000 * acos(
            cos(radians($3)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians($4))
            + sin(radians($3)) * sin(radians(p.lat))
          )
        ) AS distance_m
      FROM assignments asg
      INNER JOIN properties p ON p.id = asg.property_id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE asg.agent_id = $1 AND asg.cycle_id = $2 AND r.id IS NULL
        AND p.lat IS NOT NULL AND p.lng IS NOT NULL
      ORDER BY distance_m ASC
      LIMIT 1
    `, [agentId, cycleId, lat, lng]);

    res.json(result.rows[0] || null);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
