const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleGuard');

// Helper to get active cycle id
const getActiveCycleId = async () => {
  const result = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].id;
};

// GET /admin/dashboard - General summary and agent statuses
router.get('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const cycleId = await getActiveCycleId();
    
    if (!cycleId) {
      return res.json({
        active_cycle: null,
        agents: [],
        summary: { total_agents: 0, present_agents: 0, leave_agents: 0 }
      });
    }

    // Query status count per agent for today + cycle progress
    const queryText = `
      SELECT 
        a.id,
        a.name,
        a.phone,
        a.is_active,
        att.login_time,
        att.last_active,
        att.is_on_leave,
        COUNT(asg.id)::int as assigned_count,
        COUNT(CASE WHEN r.status_code = 'reading_taken' THEN 1 END)::int as done_count,
        COUNT(CASE WHEN r.id IS NOT NULL AND r.status_code != 'reading_taken' THEN 1 END)::int as problem_count,
        COUNT(CASE WHEN asg.id IS NOT NULL AND r.id IS NULL THEN 1 END)::int as pending_count
      FROM agents a
      LEFT JOIN attendance att ON att.agent_id = a.id AND att.date = CURRENT_DATE
      LEFT JOIN assignments asg ON asg.agent_id = a.id AND asg.cycle_id = $1
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE a.is_active = true
      GROUP BY a.id, att.id
      ORDER BY a.name ASC
    `;
    const result = await db.query(queryText, [cycleId]);

    // Calculate daily summary aggregates
    let totalAgents = result.rows.length;
    let presentAgents = 0;
    let leaveAgents = 0;
    
    result.rows.forEach(agent => {
      if (agent.is_on_leave) {
        leaveAgents++;
      } else if (agent.login_time) {
        presentAgents++;
      }
    });

    res.json({
      active_cycle_id: cycleId,
      agents: result.rows,
      summary: {
        total_agents: totalAgents,
        present_agents: presentAgents,
        leave_agents: leaveAgents,
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/agents/:id/readings - Get all submitted readings for a specific agent in a cycle
router.get('/agents/:id/readings', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const cycleId = req.query.cycle_id || await getActiveCycleId();

    if (!cycleId) {
      return res.status(400).json({ error: 'No active cycle found or specified.' });
    }

    const queryText = `
      SELECT 
        r.id as reading_id,
        r.reading_value,
        r.status_code,
        r.photo_url,
        r.note,
        r.gps_lat,
        r.gps_lng,
        r.gps_accuracy,
        r.is_anomalous,
        r.anomaly_reason,
        r.submitted_at,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      INNER JOIN properties p ON asg.property_id = p.id
      WHERE asg.agent_id = $1 AND asg.cycle_id = $2
      ORDER BY r.submitted_at DESC
    `;
    const result = await db.query(queryText, [agentId, cycleId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// PATCH /admin/agents/:id/leave - Mark agent on leave for today
router.patch('/agents/:id/leave', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const leaveSchema = z.object({ is_on_leave: z.boolean() });
    const { is_on_leave } = leaveSchema.parse(req.body);

    const queryText = `
      INSERT INTO attendance (agent_id, date, is_on_leave)
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (agent_id, date)
      DO UPDATE SET is_on_leave = EXCLUDED.is_on_leave
      RETURNING *
    `;
    const result = await db.query(queryText, [agentId, is_on_leave]);

    res.json({
      message: `Agent marked as ${is_on_leave ? 'on leave' : 'active'} for today.`,
      attendance: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/dashboard/agents/:id/pending-properties - Get unread assignments for reassignment
router.get('/agents/:id/pending-properties', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const cycleId = await getActiveCycleId();

    if (!cycleId) {
      return res.status(400).json({ error: 'No active cycle found.' });
    }

    const queryText = `
      SELECT p.id, p.serial_no, p.consumer_name, p.address
      FROM assignments asg
      INNER JOIN properties p ON asg.property_id = p.id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE asg.agent_id = $1 AND asg.cycle_id = $2 AND r.id IS NULL
    `;
    const result = await db.query(queryText, [agentId, cycleId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/dashboard/anomalies - List all anomalous readings in the active cycle
router.get('/anomalies', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const cycleId = await getActiveCycleId();
    if (!cycleId) {
      return res.json([]);
    }

    const queryText = `
      SELECT 
        r.id as reading_id,
        r.reading_value,
        r.status_code,
        r.photo_url,
        r.note,
        r.gps_lat,
        r.gps_lng,
        r.is_anomalous,
        r.anomaly_reason,
        r.submitted_at,
        p.id as property_id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        ag.name as agent_name
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      INNER JOIN properties p ON asg.property_id = p.id
      INNER JOIN agents ag ON asg.agent_id = ag.id
      WHERE asg.cycle_id = $1 AND r.is_anomalous = true
      ORDER BY r.submitted_at DESC
    `;
    const result = await db.query(queryText, [cycleId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// PATCH /admin/dashboard/readings/:id/approve - Dismiss reading anomaly flag
router.patch('/readings/:id/approve', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const readingId = req.params.id;
    const result = await db.query(
      `UPDATE readings 
       SET is_anomalous = false, anomaly_reason = NULL 
       WHERE id = $1 
       RETURNING id`,
      [readingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reading not found.' });
    }

    res.json({ message: 'Reading anomaly approved and cleared.' });
  } catch (error) {
    next(error);
  }
});

// POST /admin/dashboard/readings/:id/revisit - Schedule property revisit and clear anomaly flag
router.post('/readings/:id/revisit', authMiddleware, requireAdmin, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const readingId = req.params.id;
    const adminId = req.user.id;

    await client.query('BEGIN');

    // 1. Fetch assignment context of the reading
    const readRes = await client.query(
      `SELECT asg.property_id, asg.cycle_id 
       FROM readings r
       INNER JOIN assignments asg ON r.assignment_id = asg.id
       WHERE r.id = $1`,
      [readingId]
    );

    if (readRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reading context not found.' });
    }

    const { property_id, cycle_id } = readRes.rows[0];

    // 2. Schedule revisit entry (set for next day)
    await client.query(
      `INSERT INTO revisits (property_id, cycle_id, scheduled_date, created_by)
       VALUES ($1, $2, CURRENT_DATE + 1, $3)`,
      [property_id, cycle_id, adminId]
    );

    // 3. Clear anomaly flag and mark status as revisit scheduled
    await client.query(
      `UPDATE readings 
       SET is_anomalous = false, anomaly_reason = 'Revisit scheduled by administrator' 
       WHERE id = $1`,
      [readingId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Revisit scheduled successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET /admin/dashboard/global-search - Global property search across multiple fields
router.get('/global-search', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    const queryText = `
      SELECT 
        p.id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.society,
        p.raw_sap_data,
        a.name as area_name,
        ag.name as agent_name,
        asg.id as assignment_id,
        r.status_code,
        r.reading_value,
        r.photo_url,
        r.note,
        r.is_anomalous,
        r.anomaly_reason,
        r.submitted_at
      FROM properties p
      LEFT JOIN areas a ON p.area_id = a.id
      LEFT JOIN cycles cy ON cy.is_active = true
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = cy.id
      LEFT JOIN agents ag ON asg.agent_id = ag.id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE 
        p.consumer_name ILIKE $1 OR
        p.serial_no ILIKE $1 OR
        p.meter_no ILIKE $1 OR
        p.address ILIKE $1 OR
        p.society ILIKE $1 OR
        p.raw_sap_data->>'Mobile No.' ILIKE $1 OR
        p.raw_sap_data->>'Telephone No.' ILIKE $1 OR
        p.raw_sap_data->>'BP No.' ILIKE $1 OR
        p.raw_sap_data->>'Installation No.' ILIKE $1 OR
        a.name ILIKE $1 OR
        ag.name ILIKE $1
      ORDER BY p.consumer_name ASC
      LIMIT 100
    `;
    const result = await db.query(queryText, [searchTerm]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/dashboard/download-images - Stream meter reading images directly into a ZIP
router.get('/download-images', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { cycle_id, year, month, mru, society, q } = req.query;

    let whereClause = `WHERE r.photo_url IS NOT NULL AND r.photo_url <> ''`;
    const params = [];

    if (cycle_id) {
      params.push(cycle_id);
      whereClause += ` AND asg.cycle_id = $${params.length}`;
    }
    if (year && month) {
      params.push(parseInt(year), parseInt(month));
      whereClause += ` AND EXTRACT(YEAR FROM i.scheduled_date) = $${params.length - 1} AND EXTRACT(MONTH FROM i.scheduled_date) = $${params.length}`;
    }
    if (mru && mru !== 'all') {
      params.push(mru);
      whereClause += ` AND a.name = $${params.length}`;
    }
    if (society && society.trim()) {
      params.push(`%${society.trim()}%`);
      whereClause += ` AND p.society ILIKE $${params.length}`;
    }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      whereClause += ` AND (p.consumer_name ILIKE $${params.length} OR p.serial_no ILIKE $${params.length} OR p.meter_no ILIKE $${params.length} OR p.raw_sap_data->>'BP No.' ILIKE $${params.length})`;
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = month ? (monthNames[parseInt(month) - 1] || month) : 'Cycle';
    const mruLabel = mru && mru !== 'all' ? mru : 'ALL';
    const zipFilename = `${mruLabel}_${monthName}_${year || '2026'}.zip`;

    const result = await db.query(`
      SELECT 
        r.photo_url, 
        r.submitted_at, 
        p.serial_no, 
        p.consumer_name,
        p.raw_sap_data->>'BP No.' as sap_bp_no
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      INNER JOIN properties p ON asg.property_id = p.id
      LEFT JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      ${whereClause}
      ORDER BY r.submitted_at DESC
      LIMIT 1000
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No images found for the selected filters.' });
    }

    const archiver = require('archiver');
    const axios = require('axios');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const createArchive = (options) => {
      if (typeof archiver === 'function') return archiver('zip', options);
      if (typeof archiver.create === 'function') return archiver.create('zip', options);
      if (archiver.ZipArchive) return new archiver.ZipArchive(options);
      throw new Error('Unsupported archiver module format');
    };

    const archive = createArchive({ zlib: { level: 5 } });

    archive.on('error', (err) => {
      console.error('ZIP archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'ZIP generation failed.' });
      }
    });

    archive.pipe(res);

    const usedFilenames = new Set();

    for (const row of result.rows) {
      try {
        const imageRes = await axios.get(row.photo_url, { responseType: 'arraybuffer', timeout: 10000 });
        const buffer = Buffer.from(imageRes.data);
        
        // BP No. from raw_sap_data or fallback to p.serial_no
        const bpNo = row.sap_bp_no || row.serial_no || '0000000000';
        
        // Date format: DD-MM-YYYY
        let dateStr = '01-01-2026';
        if (row.submitted_at) {
          const d = new Date(row.submitted_at);
          const day = String(d.getDate()).padStart(2, '0');
          const monthStr = String(d.getMonth() + 1).padStart(2, '0');
          const yearStr = d.getFullYear();
          dateStr = `${day}-${monthStr}-${yearStr}`;
        }

        const baseFilename = `${bpNo}_${dateStr}`;
        let filename = `${baseFilename}.jpg`;
        
        let dupCount = 1;
        while (usedFilenames.has(filename)) {
          filename = `${baseFilename}_${dupCount}.jpg`;
          dupCount++;
        }
        usedFilenames.add(filename);

        archive.append(buffer, { name: filename });
      } catch (imgErr) {
        console.warn(`Skipping image for ${row.serial_no}:`, imgErr.message);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Image download failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to generate image archive.' });
    }
  }
});

module.exports = router;
