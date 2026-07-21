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
    throw new Error('No active billing cycle found. Please create one first.');
  }
  return result.rows[0].id;
};

const assignAreaSchema = z.object({
  area_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  cycle_id: z.string().uuid().optional(),
});

const assignRangeSchema = z.object({
  agent_id: z.string().uuid(),
  start_serial: z.number().int().nonnegative(),
  end_serial: z.number().int().nonnegative(),
  cycle_id: z.string().uuid().optional(),
});

const assignBulkSchema = z.object({
  agent_id: z.string().uuid(),
  property_ids: z.array(z.string().uuid()),
  cycle_id: z.string().uuid().optional(),
});

// POST /admin/assignments/area - Assign all properties in an area to an agent
router.post('/area', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { area_id, agent_id, cycle_id } = assignAreaSchema.parse(req.body);
    const targetCycleId = cycle_id || await getActiveCycleId();
    const adminId = req.user.id;

    // Insert assignments for all properties in the specified area
    // ON CONFLICT update agent_id in case it is already assigned to someone else
    const queryText = `
      INSERT INTO assignments (agent_id, property_id, cycle_id, assigned_by)
      SELECT $1, id, $2, $3 
      FROM properties 
      WHERE area_id = $4
      ON CONFLICT (property_id, cycle_id) 
      DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_by = EXCLUDED.assigned_by
      RETURNING id
    `;
    const result = await db.query(queryText, [agent_id, targetCycleId, adminId, area_id]);

    res.json({ 
      message: `Assigned all properties in area to agent successfully.`,
      count: result.rowCount 
    });
  } catch (error) {
    next(error);
  }
});

// POST /admin/assignments/range - Assign properties by serial range to an agent
router.post('/range', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { agent_id, start_serial, end_serial, cycle_id } = assignRangeSchema.parse(req.body);
    const targetCycleId = cycle_id || await getActiveCycleId();
    const adminId = req.user.id;

    if (start_serial > end_serial) {
      return res.status(400).json({ error: 'Start serial must be less than or equal to end serial.' });
    }

    // Insert assignments matching integer-based range comparison of serial_no
    const queryText = `
      INSERT INTO assignments (agent_id, property_id, cycle_id, assigned_by)
      SELECT $1, id, $2, $3 
      FROM properties 
      WHERE serial_no ~ '^[0-9]+$' AND serial_no::integer BETWEEN $4 AND $5
      ON CONFLICT (property_id, cycle_id) 
      DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_by = EXCLUDED.assigned_by
      RETURNING id
    `;
    const result = await db.query(queryText, [agent_id, targetCycleId, adminId, start_serial, end_serial]);

    res.json({
      message: `Assigned properties within serial range ${start_serial}-${end_serial} successfully.`,
      count: result.rowCount
    });
  } catch (error) {
    next(error);
  }
});

// POST /admin/assignments/bulk - Assign specific array of properties to an agent
router.post('/bulk', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { agent_id, property_ids, cycle_id } = assignBulkSchema.parse(req.body);
    const targetCycleId = cycle_id || await getActiveCycleId();
    const adminId = req.user.id;

    if (property_ids.length === 0) {
      return res.status(400).json({ error: 'property_ids array must not be empty.' });
    }

    // We can do standard INSERT for each property in transaction or bulk insert query
    // Let's use bulk insert by joining array
    const queryText = `
      INSERT INTO assignments (agent_id, property_id, cycle_id, assigned_by)
      SELECT $1, unnest($2::uuid[]), $3, $4
      ON CONFLICT (property_id, cycle_id) 
      DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_by = EXCLUDED.assigned_by
      RETURNING id
    `;
    const result = await db.query(queryText, [agent_id, property_ids, targetCycleId, adminId]);

    res.json({
      message: `Assigned ${result.rowCount} properties to agent successfully.`,
      count: result.rowCount
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
router.get('/mrus', authMiddleware, requireAdmin, async (req, res, next) => {
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
router.get('/months', authMiddleware, requireAdmin, async (req, res, next) => {
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
        r.reading_value
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
        queryText += ` AND p.society = ANY($${paramCount}::varchar[])`;
        params.push(socList);
        paramCount++;
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
router.get('/export', authMiddleware, requireAdmin, async (req, res, next) => {
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
        latest_r.note
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      LEFT JOIN LATERAL (
        SELECT r.status_code, r.reading_value, r.submitted_at, r.note
        FROM readings r
        JOIN assignments asg ON r.assignment_id = asg.id
        WHERE asg.property_id = p.id
          AND asg.cycle_id = $3
        ORDER BY r.submitted_at DESC
        LIMIT 1
      ) latest_r ON true
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

      const mrNoteMap = {
        reading_taken:   'Reading Taken',
        door_locked:     'Door Locked',
        not_reachable:   'Not Reachable',
        access_denied:   'Access Denied',
        meter_not_found: 'Meter Not Found',
        meter_damaged:   'Meter Damaged',
        revisit_needed:  'Revisit Needed',
        vacant_property: 'Vacant Property',
      };
      const mrNote = r.status_code ? (mrNoteMap[r.status_code] || r.status_code.replace(/_/g, ' ').toUpperCase()) : '';

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
      rowObj['Current MR'] = r.reading_value !== null && r.reading_value !== undefined ? r.reading_value : '';
      rowObj['MR Note'] = mrNote;
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
