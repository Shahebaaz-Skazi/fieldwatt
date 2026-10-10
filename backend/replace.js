const fs = require('fs');
const path = 'backend/src/routes/admin/assignments.js';
let content = fs.readFileSync(path, 'utf8');

const targetSelect = "SELECT DISTINCT ON (assignment_id) id, assignment_id, reading_value, status_code, note, photo_url, gps_lat, gps_lng, submitted_at";
const targetOrder = "ORDER BY assignment_id, submitted_at DESC";

const newSelect = "SELECT id, assignment_id, reading_value, status_code, note, photo_url, gps_lat, gps_lng, MAX(submitted_at) as submitted_at";
const newGroup = "GROUP BY assignment_id";

content = content.split(targetSelect).join(newSelect);
content = content.split(targetOrder).join(newGroup);

fs.writeFileSync(path, content);
console.log('Replaced', content.includes(newSelect));
