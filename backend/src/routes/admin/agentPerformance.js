const express = require('express');
const router = express.Router();
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requirePerformanceViewer } = require('../../middleware/roleGuard');
const cache = require('../../utils/cache');

// Helper to resolve permitted agent IDs for current user
const getPermittedAgentIds = async (user) => {
  if (user.role === 'admin') return null; // null means no restriction (admin sees all)
  if (user.role === 'agent_performance_viewer') {
    const res = await db.query(
      'SELECT agent_id FROM agent_performance_account_agents WHERE account_id = $1',
      [user.id]
    );
    return res.rows.map(r => r.agent_id);
  }
  return []; // default empty
};

// GET /admin/agent-performance?period=daily|weekly|monthly|cycle&cycle_id=UUID&agent_id=UUID
router.get('/', authMiddleware, requirePerformanceViewer, async (req, res) => {
  try {
    const { period = 'monthly', cycle_id, agent_id } = req.query;

    const permittedAgentIds = await getPermittedAgentIds(req.user);
    
    // If contractor has specific agent permissions
    if (permittedAgentIds !== null) {
      if (permittedAgentIds.length === 0) {
        return res.json({ agents: [], cycles: [], period, generatedAt: new Date().toISOString() });
      }
      // Security Check: If specific agent_id requested, it MUST be in permitted list
      if (agent_id && !permittedAgentIds.includes(agent_id)) {
        return res.status(403).json({ error: 'Access forbidden. You do not have permission to view this agent.' });
      }
    }

    const cacheKey = `agent_perf_${req.user.id}_${period}_${cycle_id || 'default'}_${agent_id || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    let targetCycleId = cycle_id;
    if (!targetCycleId) {
      const activeCycleRes = await db.query(`SELECT id FROM cycles WHERE is_active = true ORDER BY start_date DESC LIMIT 1`);
      if (activeCycleRes.rows.length > 0) {
        targetCycleId = activeCycleRes.rows[0].id;
      } else {
        targetCycleId = '00000000-0000-0000-0000-000000000000';
      }
    }

    // Build date filter based on period
    let dateFilter = '';
    if (period === 'daily') {
      dateFilter = `AND DATE(r.submitted_at) = CURRENT_DATE`;
    } else if (period === 'weekly') {
      dateFilter = `AND r.submitted_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === 'monthly') {
      dateFilter = `AND DATE_TRUNC('month', r.submitted_at) = DATE_TRUNC('month', NOW())`;
    } else if (period === 'cycle' && targetCycleId) {
      dateFilter = `AND asg.cycle_id = '${targetCycleId}'`;
    }

    // Build agent WHERE filter
    let agentFilterSql = 'WHERE ag.is_active = true';
    let queryParams = [targetCycleId];

    if (permittedAgentIds !== null) {
      // Contractor role: strictly limit to permitted IDs
      const targetIds = agent_id ? [agent_id] : permittedAgentIds;
      const placeholders = targetIds.map((_, i) => `$${i + 2}`).join(', ');
      agentFilterSql += ` AND ag.id IN (${placeholders})`;
      queryParams.push(...targetIds);
    } else if (agent_id) {
      // Admin optional single agent filter
      agentFilterSql += ` AND ag.id = $2`;
      queryParams.push(agent_id);
    }

    const result = await db.query(`
      SELECT
        ag.id as agent_id,
        ag.name as agent_name,
        ag.last_login,
        COUNT(DISTINCT asg.id) as total_assigned,
        COALESCE(alltime.total_submitted_alltime, 0) as total_submitted_alltime,
        COUNT(DISTINCT asg.id) - COALESCE(alltime.total_submitted_alltime, 0) as not_visited,
        COALESCE(period_counts.total_submitted, 0) as total_submitted,
        COALESCE(period_counts.reading_taken, 0) as reading_taken,
        COALESCE(period_counts.door_locked, 0) as door_locked,
        COALESCE(period_counts.not_reachable, 0) as not_reachable,
        COALESCE(period_counts.access_denied, 0) as access_denied,
        COALESCE(period_counts.meter_not_found, 0) as meter_not_found,
        COALESCE(period_counts.meter_damaged, 0) as meter_damaged,
        COALESCE(period_counts.vacant_property, 0) as vacant_property,
        COALESCE(period_counts.revisit_needed, 0) as revisit_needed,
        ROUND(
          CASE WHEN COUNT(DISTINCT asg.id) > 0
          THEN COALESCE(alltime.total_submitted_alltime, 0)::numeric / COUNT(DISTINCT asg.id) * 100
          ELSE 0 END, 1
        ) as completion_percentage
      FROM agents ag
      LEFT JOIN assignments asg ON ag.id = asg.agent_id AND asg.cycle_id = $1
      -- Subquery 1: all-time counts, no date filter
      LEFT JOIN (
        SELECT asg2.agent_id, COUNT(DISTINCT r2.id) as total_submitted_alltime
        FROM assignments asg2
        LEFT JOIN readings r2 ON asg2.id = r2.assignment_id
        WHERE asg2.cycle_id = $1
        GROUP BY asg2.agent_id
      ) alltime ON alltime.agent_id = ag.id
      -- Subquery 2: period-filtered counts
      LEFT JOIN (
        SELECT 
          asg.agent_id,
          COUNT(DISTINCT r.id) as total_submitted,
          SUM(CASE WHEN r.status_code = 'reading_taken' THEN 1 ELSE 0 END) as reading_taken,
          SUM(CASE WHEN r.status_code = 'door_locked' THEN 1 ELSE 0 END) as door_locked,
          SUM(CASE WHEN r.status_code = 'not_reachable' THEN 1 ELSE 0 END) as not_reachable,
          SUM(CASE WHEN r.status_code = 'access_denied' THEN 1 ELSE 0 END) as access_denied,
          SUM(CASE WHEN r.status_code = 'meter_not_found' THEN 1 ELSE 0 END) as meter_not_found,
          SUM(CASE WHEN r.status_code = 'meter_damaged' THEN 1 ELSE 0 END) as meter_damaged,
          SUM(CASE WHEN r.status_code = 'vacant_property' THEN 1 ELSE 0 END) as vacant_property,
          SUM(CASE WHEN r.status_code = 'revisit_needed' THEN 1 ELSE 0 END) as revisit_needed
        FROM assignments asg
        LEFT JOIN readings r ON asg.id = r.assignment_id ${dateFilter}
        WHERE asg.cycle_id = $1
        GROUP BY asg.agent_id
      ) period_counts ON period_counts.agent_id = ag.id
      ${agentFilterSql}
      GROUP BY ag.id, ag.name, ag.last_login, alltime.total_submitted_alltime,
        period_counts.total_submitted, period_counts.reading_taken, period_counts.door_locked,
        period_counts.not_reachable, period_counts.access_denied, period_counts.meter_not_found,
        period_counts.meter_damaged, period_counts.vacant_property, period_counts.revisit_needed
      ORDER BY total_assigned DESC
    `, queryParams);

    // Also fetch cycles for the dropdown (only cycles with actual imported data)
    const cyclesResult = await db.query(`
      SELECT id, label, start_date, end_date, is_active 
      FROM cycles 
      WHERE EXISTS (
        SELECT 1 FROM imports i WHERE i.billing_month = cycles.label
      )
      ORDER BY start_date DESC
    `);

    const responseData = {
      agents: result.rows,
      cycles: cyclesResult.rows,
      period,
      generatedAt: new Date().toISOString()
    };
    cache.set(cacheKey, responseData, 300000); // 5 minutes TTL (300,000ms)
    res.json(responseData);
  } catch (err) {
    console.error('Agent performance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/agent-performance/:agentId/calendar?month=YYYY-MM
router.get('/:agentId/calendar', authMiddleware, requirePerformanceViewer, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { month } = req.query; // e.g. "2026-08"

    const permittedAgentIds = await getPermittedAgentIds(req.user);
    if (permittedAgentIds !== null && !permittedAgentIds.includes(agentId)) {
      return res.status(403).json({ error: 'Access forbidden. You do not have permission to view this agent.' });
    }

    let yearVal, monthVal;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      [yearVal, monthVal] = month.split('-').map(Number);
    } else {
      const now = new Date();
      yearVal = now.getFullYear();
      monthVal = now.getMonth() + 1;
    }

    const cacheKey = `agent_cal_${agentId}_${yearVal}_${monthVal}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const queryText = `
      SELECT 
        TO_CHAR(timezone('Asia/Kolkata', r.submitted_at), 'YYYY-MM-DD') as date,
        COUNT(r.id) as total,
        SUM(CASE WHEN r.status_code = 'reading_taken' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN r.status_code != 'reading_taken' THEN 1 ELSE 0 END) as other
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      WHERE asg.agent_id = $1
        AND EXTRACT(YEAR FROM timezone('Asia/Kolkata', r.submitted_at)) = $2
        AND EXTRACT(MONTH FROM timezone('Asia/Kolkata', r.submitted_at)) = $3
      GROUP BY TO_CHAR(timezone('Asia/Kolkata', r.submitted_at), 'YYYY-MM-DD')
      ORDER BY date ASC
    `;

    const result = await db.query(queryText, [agentId, yearVal, monthVal]);
    
    const dailyStats = {};
    result.rows.forEach(row => {
      dailyStats[row.date] = {
        total: row.total,
        done: row.done,
        other: row.other
      };
    });

    const responseData = {
      agent_id: agentId,
      year: yearVal,
      month: monthVal,
      stats: dailyStats
    };
    cache.set(cacheKey, responseData, 300000); // 5 min TTL
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
