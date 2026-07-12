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

module.exports = router;
