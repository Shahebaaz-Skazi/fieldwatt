/**
 * scripts/create-replies-table.js
 *
 * Creates the whatsapp_replies table to store incoming customer text messages.
 */
const db = require('../src/utils/db');

async function run() {
  console.log('Creating table whatsapp_replies...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_replies (
      id TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || 
        lower(hex(randomblob(2))) || '-4' || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        substr('89ab', abs(random()) % 4 + 1, 1) || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        lower(hex(randomblob(6)))
      ),
      phone_number TEXT NOT NULL,
      profile_name TEXT,
      message_body TEXT NOT NULL,
      received_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('Table whatsapp_replies created successfully!');
}

run().catch(console.error);
