const db = require('./src/utils/db');

async function test() {
  const sql = `
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
  try {
    const res = await db.query(sql, ['5eb0b39b-56ab-45bd-8309-aaf312d53a6b']);
    console.log('SUCCESS:', res.rows);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

test();
