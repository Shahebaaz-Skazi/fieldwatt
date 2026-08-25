const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin, requireViewer } = require('../../middleware/roleGuard');

// Helper to get active cycle id
const getActiveCycleId = async () => {
  const result = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
  if (result.rows.length === 0) {
    throw new Error('No active billing cycle found. Please create one first.');
  }
  return result.rows[0].id;
};

// Safe dynamic cycle resolution helper
const resolveCycleHelper = async (cycleId, month, year, fallbackQueryFunc) => {
  let targetCycleId = cycleId;
  if (!targetCycleId) {
    let targetMonth = month;
    let targetYear = year;
    
    if (!targetMonth || !targetYear) {
      const billingMonthStr = await fallbackQueryFunc();
      if (billingMonthStr) {
        const parts = billingMonthStr.split(' ');
        targetMonth = parts[0];
        targetYear = parseInt(parts[1]);
      }
    }
    
    if (!targetMonth || !targetYear) {
      const now = new Date();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      targetMonth = targetMonth || monthNames[now.getMonth()];
      targetYear = targetYear || now.getFullYear();
    }
    
    // Query cycles for an existing record
    const cycleCheck = await db.query(
      'SELECT id FROM cycles WHERE month = $1 AND year = $2 LIMIT 1',
      [targetMonth, targetYear]
    );
    
    if (cycleCheck.rows.length > 0) {
      targetCycleId = cycleCheck.rows[0].id;
    } else {
      const newUuid = `cycle_${targetMonth.toLowerCase()}_${targetYear}_${Date.now()}`;
      const cycleName = `${targetMonth} ${targetYear} Billing Cycle`;
      await db.query(
        `INSERT INTO cycles (id, name, month, year, status, label, is_active, start_date, end_date, created_at)
         VALUES ($1, $2, $3, $4, 'active', $5, 1, date('now'), date('now', '+30 days'), datetime('now'))`,
        [newUuid, cycleName, targetMonth, Number(targetYear), cycleName]
      );
      targetCycleId = newUuid;
      console.log(`[assignments] Created dynamic cycle: "${cycleName}" (${targetCycleId})`);
    }
  } else {
    const cycleCheck = await db.query('SELECT id FROM cycles WHERE id = $1 LIMIT 1', [targetCycleId]);
    if (cycleCheck.rows.length === 0) {
      targetCycleId = await getActiveCycleId();
    }
  }
  return targetCycleId;
};

const chunkArray = (array, size = 50) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const assignAreaSchema = z.object({
  area_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  cycle_id: z.string().uuid().optional(),
  month: z.string().optional(),
  year: z.number().int().optional(),
});

const assignRangeSchema = z.object({
  agent_id: z.string().uuid(),
  start_serial: z.number().int().nonnegative(),
  end_serial: z.number().int().nonnegative(),
  cycle_id: z.string().uuid().optional(),
  month: z.string().optional(),
  year: z.number().int().optional(),
});

const assignBulkSchema = z.object({
  agent_id: z.string().uuid(),
  property_ids: z.array(z.string().uuid()),
  cycle_id: z.string().uuid().optional(),
  month: z.string().optional(),
  year: z.number().int().optional(),
});

// POST /admin/assignments/area - Assign all properties in an area to an agent
router.post('/area', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { area_id, agent_id, cycle_id, month, year } = assignAreaSchema.parse(req.body);
    const adminId = req.user.id;

    // 1. Verify agent exists
    const agentCheck = await db.query('SELECT id FROM agents WHERE id = $1 LIMIT 1', [agent_id]);
    if (agentCheck.rows.length === 0) {
      return res.status(400).json({ error: `Agent with ID ${agent_id} does not exist.` });
    }

    // 2. Resolve or dynamically create cycle
    const targetCycleId = await resolveCycleHelper(cycle_id, month, year, async () => {
      const propImportRes = await db.query(
        `SELECT i.billing_month 
         FROM properties p
         INNER JOIN imports i ON p.import_id = i.id
         WHERE p.area_id = $1 LIMIT 1`,
        [area_id]
      );
      return propImportRes.rows[0]?.billing_month;
    });

    // 3. Get all property IDs in this area to update them in properties table
    const propsInAreaRes = await db.query('SELECT id FROM properties WHERE area_id = $1', [area_id]);
    const propertyIds = propsInAreaRes.rows.map(r => r.id);

    if (propertyIds.length === 0) {
      return res.json({ message: 'No properties found in this area.', count: 0 });
    }

    // 4. Batch insert/upsert and update properties in chunks of 50
    const chunks = chunkArray(propertyIds, 50);
    let totalCount = 0;

    for (const chunk of chunks) {
      const chunkStatements = [];

      chunk.forEach(propId => {
        chunkStatements.push({
          sql: `
            INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at, assigned_by)
            VALUES ($1, $2, $3, $4, 0, datetime('now'), $5)
            ON CONFLICT (property_id, cycle_id) 
            DO UPDATE SET agent_id = EXCLUDED.agent_id, is_completed = 0, assigned_by = EXCLUDED.assigned_by
            RETURNING id
          `,
          params: [require('crypto').randomUUID(), propId, agent_id, targetCycleId, adminId]
        });
      });

      const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ');
      chunkStatements.push({
        sql: `
          UPDATE properties 
          SET is_assigned = 1, assigned_agent_id = $1 
          WHERE id IN (${placeholders})
        `,
        params: [agent_id, ...chunk]
      });

      const batchRes = await db.batch(chunkStatements);
      const insertResults = batchRes.slice(0, chunk.length);
      totalCount += insertResults.reduce((sum, r) => sum + r.rowCount, 0);
    }

    res.json({ 
      message: `Assigned all properties in area to agent successfully.`,
      count: totalCount 
    });
  } catch (error) {
    next(error);
  }
});

// POST /admin/assignments/range - Assign properties by serial range to an agent
router.post('/range', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { agent_id, start_serial, end_serial, cycle_id, month, year } = assignRangeSchema.parse(req.body);
    const adminId = req.user.id;

    if (start_serial > end_serial) {
      return res.status(400).json({ error: 'Start serial must be less than or equal to end serial.' });
    }

    // 1. Verify agent exists
    const agentCheck = await db.query('SELECT id FROM agents WHERE id = $1 LIMIT 1', [agent_id]);
    if (agentCheck.rows.length === 0) {
      return res.status(400).json({ error: `Agent with ID ${agent_id} does not exist.` });
    }

    // 2. Resolve or dynamically create cycle
    const targetCycleId = await resolveCycleHelper(cycle_id, month, year, async () => {
      const propImportRes = await db.query(
        `SELECT i.billing_month 
         FROM properties p
         INNER JOIN imports i ON p.import_id = i.id
         WHERE p.serial_no NOT GLOB '*[^0-9]*' AND CAST(p.serial_no AS INTEGER) BETWEEN $1 AND $2 LIMIT 1`,
        [start_serial, end_serial]
      );
      return propImportRes.rows[0]?.billing_month;
    });

    // 3. Find property IDs within this range
    const propsInRangeRes = await db.query(
      `SELECT id FROM properties 
       WHERE serial_no NOT GLOB '*[^0-9]*' AND CAST(serial_no AS INTEGER) BETWEEN $1 AND $2`,
      [start_serial, end_serial]
    );
    const propertyIds = propsInRangeRes.rows.map(r => r.id);

    if (propertyIds.length === 0) {
      return res.json({ message: 'No properties found within this serial range.', count: 0 });
    }

    // 4. Batch insert/upsert and update properties in chunks of 50
    const chunks = chunkArray(propertyIds, 50);
    let totalCount = 0;

    for (const chunk of chunks) {
      const chunkStatements = [];

      chunk.forEach(propId => {
        chunkStatements.push({
          sql: `
            INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at, assigned_by)
            VALUES ($1, $2, $3, $4, 0, datetime('now'), $5)
            ON CONFLICT (property_id, cycle_id) 
            DO UPDATE SET agent_id = EXCLUDED.agent_id, is_completed = 0, assigned_by = EXCLUDED.assigned_by
            RETURNING id
          `,
          params: [require('crypto').randomUUID(), propId, agent_id, targetCycleId, adminId]
        });
      });

      const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ');
      chunkStatements.push({
        sql: `
          UPDATE properties 
          SET is_assigned = 1, assigned_agent_id = $1 
          WHERE id IN (${placeholders})
        `,
        params: [agent_id, ...chunk]
      });

      const batchRes = await db.batch(chunkStatements);
      const insertResults = batchRes.slice(0, chunk.length);
      totalCount += insertResults.reduce((sum, r) => sum + r.rowCount, 0);
    }

    res.json({
      message: `Assigned properties within serial range ${start_serial}-${end_serial} successfully.`,
      count: totalCount
    });
  } catch (error) {
    next(error);
  }
});

// POST /admin/assignments/bulk - Assign specific array of properties to an agent
router.post('/bulk', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { agent_id, property_ids, cycle_id, month, year } = assignBulkSchema.parse(req.body);
    const adminId = req.user.id;

    if (property_ids.length === 0) {
      return res.status(400).json({ error: 'property_ids array must not be empty.' });
    }

    // 1. Verify agent exists
    const agentCheck = await db.query('SELECT id FROM agents WHERE id = $1 LIMIT 1', [agent_id]);
    if (agentCheck.rows.length === 0) {
      return res.status(400).json({ error: `Agent with ID ${agent_id} does not exist.` });
    }

    // 2. Filter properties that actually exist in the database (chunked to avoid D1 limits)
    const propertyChunks = chunkArray(property_ids, 50);
    const propertyQueries = propertyChunks.map(chunk => {
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      return db.query(`SELECT id FROM properties WHERE id IN (${placeholders})`, chunk);
    });
    const propertyQueryResults = await Promise.all(propertyQueries);
    const existingPropIds = propertyQueryResults.flatMap(r => r.rows.map(row => row.id));

    if (existingPropIds.length === 0) {
      return res.status(400).json({ error: 'None of the provided property_ids exist in the database.' });
    }

    // 3. Resolve or dynamically create cycle
    const targetCycleId = await resolveCycleHelper(cycle_id, month, year, async () => {
      const propImportRes = await db.query(
        `SELECT i.billing_month 
         FROM properties p
         INNER JOIN imports i ON p.import_id = i.id
         WHERE p.id = $1 LIMIT 1`,
        [existingPropIds[0]]
      );
      return propImportRes.rows[0]?.billing_month;
    });

    // 4. Batch insert/upsert and update properties in chunks of 50
    const chunks = chunkArray(existingPropIds, 50);
    let totalCount = 0;

    for (const chunk of chunks) {
      const chunkStatements = [];

      chunk.forEach(propId => {
        chunkStatements.push({
          sql: `
            INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at, assigned_by)
            VALUES ($1, $2, $3, $4, 0, datetime('now'), $5)
            ON CONFLICT (property_id, cycle_id) 
            DO UPDATE SET agent_id = EXCLUDED.agent_id, is_completed = 0, assigned_by = EXCLUDED.assigned_by
            RETURNING id
          `,
          params: [require('crypto').randomUUID(), propId, agent_id, targetCycleId, adminId]
        });
      });

      const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ');
      chunkStatements.push({
        sql: `
          UPDATE properties 
          SET is_assigned = 1, assigned_agent_id = $1 
          WHERE id IN (${placeholders})
        `,
        params: [agent_id, ...chunk]
      });

      const batchRes = await db.batch(chunkStatements);
      const insertResults = batchRes.slice(0, chunk.length);
      totalCount += insertResults.reduce((sum, r) => sum + r.rowCount, 0);
    }

    res.json({
      message: `Assigned ${totalCount} properties to agent successfully.`,
      count: totalCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/coverage - Coverage status and unassigned counts per area
router.get('/coverage', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const cycleId = req.query.cycle_id || await getActiveCycleId();

    const queryText = `
      SELECT 
        a.id as area_id,
        a.name as area_name,
        COUNT(p.id)::int as total_properties,
        COUNT(asg.id)::int as assigned_properties,
        (COUNT(p.id) - COUNT(asg.id))::int as unassigned_properties
      FROM areas a
      LEFT JOIN properties p ON p.area_id = a.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
      GROUP BY a.id, a.name
      ORDER BY a.name ASC
    `;
    const result = await db.query(queryText, [cycleId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});
// GET /admin/assignments/mrus - Get list of distinct MRU names (area names from areas table)
router.get('/mrus', authMiddleware, requireViewer, async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT DISTINCT name FROM areas WHERE name IS NOT NULL AND name <> '' ORDER BY name ASC"
    );
    res.json(result.rows.map(r => r.name));
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/months - Get available years and months for a selected MRU area name (or all)
router.get('/months', authMiddleware, requireViewer, async (req, res, next) => {
  try {
    const { mru } = req.query;
    if (!mru) {
      return res.status(400).json({ error: 'mru parameter is required.' });
    }
    
    let queryText = `
      SELECT DISTINCT 
         EXTRACT(YEAR FROM i.scheduled_date)::int as year,
         EXTRACT(MONTH FROM i.scheduled_date)::int as month
       FROM imports i
       INNER JOIN properties p ON p.import_id = i.id
       INNER JOIN areas a ON p.area_id = a.id
    `;
    let params = [];
    if (mru !== 'all') {
      queryText += ' WHERE a.name = $1';
      params = [mru];
    }
    queryText += ' ORDER BY year DESC, month DESC';
    
    const result = await db.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/cycles - Get list of billing cycles
router.get('/cycles', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT id, label, is_active FROM cycles ORDER BY start_date DESC"
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/societies - Get list of distinct society names (filtered by MRU area name, year, month) with assignment counts
router.get('/societies', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { mru, year, month } = req.query;
    let queryText = `
      SELECT 
        society, 
        0::int as total_count, 
        0::int as assigned_count 
      FROM properties 
      WHERE society IS NOT NULL AND society <> ''
      GROUP BY society
    `;
    let params = [];
    if (mru && year && month) {
      if (mru === 'all') {
        queryText = `
          SELECT 
            p.society,
            COUNT(p.id)::int as total_count,
            COUNT(asg.id)::int as assigned_count
          FROM properties p
          INNER JOIN imports i ON p.import_id = i.id
          LEFT JOIN cycles c ON c.label = i.billing_month
          LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = c.id
          WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1 
            AND EXTRACT(MONTH FROM i.scheduled_date) = $2
            AND p.society IS NOT NULL AND p.society <> ''
          GROUP BY p.society
        `;
        params = [parseInt(year), parseInt(month)];
      } else {
        queryText = `
          SELECT 
            p.society,
            COUNT(p.id)::int as total_count,
            COUNT(asg.id)::int as assigned_count
          FROM properties p
          INNER JOIN areas a ON p.area_id = a.id
          INNER JOIN imports i ON p.import_id = i.id
          LEFT JOIN cycles c ON c.label = i.billing_month
          LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = c.id
          WHERE a.name = $1 
            AND EXTRACT(YEAR FROM i.scheduled_date) = $2 
            AND EXTRACT(MONTH FROM i.scheduled_date) = $3
            AND p.society IS NOT NULL AND p.society <> ''
          GROUP BY p.society
        `;
        params = [mru, parseInt(year), parseInt(month)];
      }
    }
    queryText += " ORDER BY society ASC";
    const result = await db.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/search-properties - Query properties with status and society groupings by area name (or all)
router.get('/search-properties', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { q, mru, year, month, status, societies, agent_filter_id } = req.query;
    
    if (!mru || !year || !month) {
      return res.json({ properties: [], cycleId: null });
    }

    // Resolve target cycle ID from any import in this period
    const cycleRes = await db.query(
      `SELECT c.id as cycle_id
       FROM cycles c
       WHERE c.label = (
         SELECT billing_month FROM imports i
         WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1 
           AND EXTRACT(MONTH FROM i.scheduled_date) = $2
         LIMIT 1
       )`,
      [parseInt(year), parseInt(month)]
    );
    const targetCycleId = cycleRes.rows.length > 0 ? cycleRes.rows[0].cycle_id : '00000000-0000-0000-0000-000000000000';

    let queryText = `
      SELECT 
        p.id,
        p.serial_no,
        p.raw_sap_data->>'BP No.' AS bp_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.society,
        a.name as area_name,
        asg.id as assignment_id,
        asg.agent_id,
        ag.name as agent_name,
        r.status_code,
        r.reading_value,
        CASE WHEN r.status_code = 'reading_taken' OR r.status_code = 'completed' THEN 'completed' ELSE 'pending' END as status,
        CASE WHEN r.status_code = 'reading_taken' OR r.status_code = 'completed' THEN 1 ELSE 0 END as is_completed,
        CASE WHEN asg.id IS NOT NULL THEN 1 ELSE 0 END as is_assigned
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
      LEFT JOIN agents ag ON asg.agent_id = ag.id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $2 
        AND EXTRACT(MONTH FROM i.scheduled_date) = $3
    `;
    
    const params = [targetCycleId, parseInt(year), parseInt(month)];
    let paramCount = 4;

    if (mru !== 'all') {
      queryText += ` AND a.name = $${paramCount}`;
      params.push(mru);
      paramCount++;
    }
    
    if (q && q.trim()) {
      queryText += ` AND (p.consumer_name ILIKE $${paramCount} OR p.serial_no ILIKE $${paramCount} OR p.address ILIKE $${paramCount} OR p.society ILIKE $${paramCount})`;
      params.push(`%${q.trim()}%`);
      paramCount++;
    }
    
    if (societies) {
      const socList = societies.split(',').map(s => s.trim()).filter(Boolean);
      if (socList.length > 0) {
        const placeholders = socList.map((_, idx) => `$${paramCount + idx}`).join(', ');
        queryText += ` AND p.society IN (${placeholders})`;
        params.push(...socList);
        paramCount += socList.length;
      }
    }
    
    if (status && status !== 'all') {
      if (status === 'assigned') {
        queryText += ` AND asg.id IS NOT NULL`;
      } else if (status === 'unassigned') {
        queryText += ` AND asg.id IS NULL`;
      } else if (status === 'doorlocked') {
        queryText += ` AND r.status_code = 'door_locked'`;
      } else if (status === 'completed') {
        queryText += ` AND (r.status_code = 'completed' OR r.status_code = 'reading_taken')`;
      } else if (status === 'incomplete') {
        // Assigned but pending (no reading taken or door lock recorded yet)
        queryText += ` AND asg.id IS NOT NULL AND r.id IS NULL`;
      }
    }

    if (agent_filter_id && agent_filter_id !== 'all') {
      queryText += ` AND asg.agent_id = $${paramCount}`;
      params.push(agent_filter_id);
      paramCount++;
    }
    
    queryText += ` ORDER BY p.society ASC, p.serial_no ASC LIMIT 25000`;
    
    const result = await db.query(queryText, params);
    res.json({
      properties: result.rows,
      cycleId: targetCycleId
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/assignments/export - Export properties, readings, and assignment logs in exact 30-column SAP Excel format
router.get('/export', authMiddleware, requireViewer, async (req, res, next) => {
  try {
    const { mru, year, month } = req.query;
    if (!mru || !year || !month) {
      return res.status(400).json({ error: 'mru, year, and month are required.' });
    }

    // Tier 1: Match cycle by billing_month label from the import for this period
    let cycleRes = await db.query(
      `SELECT c.id as cycle_id, c.label FROM cycles c
       WHERE c.label = (
         SELECT billing_month FROM imports i
         WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1 
           AND EXTRACT(MONTH FROM i.scheduled_date) = $2
         LIMIT 1
       )`,
      [parseInt(year), parseInt(month)]
    );

    // Tier 2: If no label match, find the cycle that actually has assignments for properties in this import
    if (cycleRes.rows.length === 0) {
      cycleRes = await db.query(
        `SELECT DISTINCT c.id as cycle_id, c.label
         FROM cycles c
         JOIN assignments asg ON asg.cycle_id = c.id
         JOIN properties p ON asg.property_id = p.id
         JOIN imports i ON p.import_id = i.id
         WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
           AND EXTRACT(MONTH FROM i.scheduled_date) = $2
         LIMIT 1`,
        [parseInt(year), parseInt(month)]
      );
    }

    // Tier 3: Fall back to the active cycle
    if (cycleRes.rows.length === 0) {
      cycleRes = await db.query(`SELECT id as cycle_id, label FROM cycles WHERE is_active = true LIMIT 1`);
    }

    const targetCycleId = cycleRes.rows.length > 0
      ? cycleRes.rows[0].cycle_id
      : '00000000-0000-0000-0000-000000000000';

    console.log(`[export] year=${year} month=${month} mru=${mru} → resolved cycle: "${cycleRes.rows[0]?.label}" (${targetCycleId})`);

    let queryText = `
      SELECT 
        p.serial_no,
        p.consumer_name,
        p.meter_no,
        p.society,
        p.sub_society,
        p.wing_code,
        p.raw_sap_data,
        a.name as area_name,
        latest_r.submitted_at,
        latest_r.reading_value,
        latest_r.status_code,
        latest_r.note,
        CASE WHEN latest_r.status_code = 'reading_taken' OR latest_r.status_code = 'completed' THEN 'completed' ELSE 'pending' END as status,
        CASE WHEN latest_r.status_code = 'reading_taken' OR latest_r.status_code = 'completed' THEN 1 ELSE 0 END as is_completed,
        CASE WHEN asg.id IS NOT NULL THEN 1 ELSE 0 END as is_assigned
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $3
      LEFT JOIN readings latest_r ON latest_r.id = (
        SELECT id
        FROM readings
        WHERE assignment_id = asg.id
        ORDER BY submitted_at DESC
        LIMIT 1
      )
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
        AND EXTRACT(MONTH FROM i.scheduled_date) = $2
    `;
    const params = [parseInt(year), parseInt(month), targetCycleId];

    if (mru !== 'all') {
      queryText += ' AND a.name = $4';
      params.push(mru);
    }

    queryText += ' ORDER BY p.serial_no ASC';
    const result = await db.query(queryText, params);
    console.log(`[export] rows returned: ${result.rows.length}, with readings: ${result.rows.filter(r => r.submitted_at).length}`);

    // Exact 30 SAP columns in order
    const sapHeaders = [
      'MR ORDER ID',
      'MRU NAME',
      'BP No.',
      'Installation No.',
      'BPNAME',
      'Regional structure g',
      'Device Serial No.',
      'c/o name',
      'Building (Number or Code)',
      'House number supplement',
      'House Number',
      'Floor in building',
      'Street 2',
      'Street 3',
      'Street',
      'Location',
      'Area',
      'city',
      'City postal code',
      'Register',
      'Scheduled meter reading date',
      'Current meter reading date',
      'Current MR',
      'MR Note',
      'Comment',
      'Excl. SD Amount',
      'SD Amount',
      'Total Amount',
      'Telephone No.',
      'Mobile No.'
    ];

    const exportRows = result.rows.map(r => {
      const sap = r.raw_sap_data || {};

      let readingDate = '';
      if (r.submitted_at) {
        const d = new Date(r.submitted_at);
        const day = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        readingDate = `${day}.${monthStr}.${yearStr}`;
      }

      // MR Note: use the agent's sub-remark note directly.
      // It already contains the exact remark selected (e.g. "Actual Meter Reading", "Address Not Found").
      let computedMrNote = '';
      if (r.note && r.note.trim()) {
        // Extract sub-remark (before the | separator if optional note was added)
        const subRemark = r.note.trim().split(' | ')[0];
        if (subRemark.toLowerCase() === 'door locked') {
          computedMrNote = 'DOOR LOCK';
        } else {
          computedMrNote = subRemark.toUpperCase();
        }
      } else if (r.status_code === 'reading_taken') {
        computedMrNote = 'ACTUAL METER READING';
      } else if (r.status_code === 'door_locked') {
        computedMrNote = 'DOOR LOCK';
      }

      const rowObj = {};
      sapHeaders.forEach(h => {
        rowObj[h] = sap[h] !== undefined && sap[h] !== null ? sap[h] : '';
      });

      // Override / map structured values cleanly
      rowObj['MR ORDER ID'] = r.serial_no || rowObj['MR ORDER ID'];
      rowObj['MRU NAME'] = (mru !== 'all' ? mru : (r.area_name || rowObj['MRU NAME']));
      rowObj['BPNAME'] = r.consumer_name || rowObj['BPNAME'];
      rowObj['Device Serial No.'] = r.meter_no || rowObj['Device Serial No.'];
      rowObj['Building (Number or Code)'] = r.wing_code || rowObj['Building (Number or Code)'];
      rowObj['Street 3'] = r.sub_society || rowObj['Street 3'];
      rowObj['Street'] = r.society || rowObj['Street'];

      // Filled reading values
      rowObj['Current meter reading date'] = readingDate;
      rowObj['Current MR'] = (r.reading_value !== null && r.reading_value !== undefined)
        ? String(r.reading_value).replace(/\.0+$/, '')
        : '';
      rowObj['MR Note'] = computedMrNote;
      rowObj['Comment'] = r.note || '';

      return rowObj;
    });

    const XLSX = require('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: sapHeaders });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="FieldWatt_${mru}_${month}_${year}_Export.xlsx"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
