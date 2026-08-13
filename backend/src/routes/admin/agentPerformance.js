const express = require('express');
const router = express.Router();
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const requireAdmin = require('../../middleware/requireAdmin');

// GET /admin/agent-performance?period=daily|weekly|monthly|cycle&cycle_id=UUID
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { period = 'monthly', cycle_id } = req.query;

    // Build date filter based on period
    let dateFilter = '';
    if (period === 'daily') {
      dateFilter = `AND DATE(r.submitted_at) = CURRENT_DATE`;
    } else if (period === 'weekly') {
      dateFilter = `AND r.submitted_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === 'monthly') {
      dateFilter = `AND DATE_TRUNC('month', r.submitted_at) = DATE_TRUNC('month', NOW())`;
    } else if (period === 'cycle' && cycle_id) {
      dateFilter = `AND asg.cycle_id = '${cycle_id}'`;
    }

    const result = await db.query(`
      SELECT
        ag.id as agent_id,
        ag.name as agent_name,
        ag.last_login,
        COUNT(DISTINCT asg.id) as total_assigned,
        COUNT(DISTINCT r.id) as total_submitted,
        COUNT(DISTINCT asg.id) - COUNT(DISTINCT r.id) as not_visited,
        COUNT(CASE WHEN r.status_code = 'reading_taken' THEN 1 END) as reading_taken,
        COUNT(CASE WHEN r.status_code = 'door_locked' THEN 1 END) as door_locked,
        COUNT(CASE WHEN r.status_code = 'not_reachable' THEN 1 END) as not_reachable,
        COUNT(CASE WHEN r.status_code = 'access_denied' THEN 1 END) as access_denied,
        COUNT(CASE WHEN r.status_code = 'meter_not_found' THEN 1 END) as meter_not_found,
        COUNT(CASE WHEN r.status_code = 'meter_damaged' THEN 1 END) as meter_damaged,
        COUNT(CASE WHEN r.status_code = 'vacant_property' THEN 1 END) as vacant_property,
        COUNT(CASE WHEN r.status_code = 'revisit_needed' THEN 1 END) as revisit_needed,
        ROUND(
          CASE WHEN COUNT(DISTINCT asg.id) > 0 
          THEN COUNT(CASE WHEN r.status_code = 'reading_taken' THEN 1 END)::numeric / COUNT(DISTINCT asg.id) * 100
          ELSE 0 END, 1
        ) as completion_percentage
      FROM agents ag
      LEFT JOIN assignments asg ON ag.id = asg.agent_id
      LEFT JOIN readings r ON asg.id = r.assignment_id ${dateFilter}
      WHERE ag.is_active = true
      GROUP BY ag.id, ag.name, ag.last_login
      ORDER BY total_assigned DESC
    `);

    // Also fetch cycles for the dropdown
    const cyclesResult = await db.query(`
      SELECT id, label, start_date, end_date, is_active 
      FROM cycles 
      ORDER BY start_date DESC
    `);

    res.json({
      agents: result.rows,
      cycles: cyclesResult.rows,
      period,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Agent performance error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
