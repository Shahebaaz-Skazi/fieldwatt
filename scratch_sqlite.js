const Database = require('better-sqlite3');

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE properties (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    serial_no TEXT NOT NULL,
    reading_status TEXT
  );

  CREATE TABLE readings_queue (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    reading_value TEXT,
    status_code TEXT,
    photo_url TEXT,
    note TEXT,
    is_synced INTEGER,
    submitted_at TEXT
  );

  INSERT INTO properties VALUES ('p1', 'a1', '001', NULL);
  INSERT INTO readings_queue VALUES ('rq1', 'a1', '100', 'reading_taken', 'url', 'note', 0, '2026-09-23T10:00:00Z');
`);

const rows = db.prepare(`
    SELECT p.*, r.reading_value, COALESCE(r.status_code, p.reading_status) as reading_status, r.photo_url, r.note, r.is_synced
    FROM properties p
    LEFT JOIN (
      SELECT id, assignment_id, reading_value, status_code, photo_url, note, is_synced, MAX(submitted_at) as submitted_at
      FROM readings_queue
      GROUP BY assignment_id
    ) r ON p.assignment_id = r.assignment_id
`).all();

console.log(rows);
