const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Apply basic middlewares
app.use(helmet({
  crossOriginResourcePolicy: false, // ponytail: allow images to be fetched from external domains / local React apps
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Global Rate Limiter
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // max 100 requests per minute
  message: { error: 'Too many requests. Please try again later.' }
});
app.use(generalLimiter);

// Specific Auth Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 login attempts per 15 minutes
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

// Import route files
const authRouter = require('./routes/auth');
const adminAreasRouter = require('./routes/admin/areas');
const adminAgentsRouter = require('./routes/admin/agents');
const adminAssignmentsRouter = require('./routes/admin/assignments');
const adminDashboardRouter = require('./routes/admin/dashboard');
const adminImportRouter = require('./routes/admin/import');
const agentAssignmentsRouter = require('./routes/agent/assignments');
const agentUploadRouter = require('./routes/agent/upload');
const { router: agentSyncRouter } = require('./routes/agent/sync');
const adminWhatsappRouter = require('./routes/admin/whatsapp');
const agentPerformanceRouter = require('./routes/admin/agentPerformance');
const publicSelfReadingRouter = require('./routes/public/selfReading');

// Mount routes
app.use('/auth', authRouter);
app.use('/admin/areas', adminAreasRouter);
app.use('/admin/agents', adminAgentsRouter);
app.use('/admin/assignments', adminAssignmentsRouter);
app.use('/admin/dashboard', adminDashboardRouter);
app.use('/admin/import', adminImportRouter);
app.use('/agent/assignments', agentAssignmentsRouter);
app.use('/agent/upload-url', agentUploadRouter); // Wait, spec endpoint: POST /agent/upload-url
app.use('/sync', agentSyncRouter); // Mount at /sync to serve /sync/batch
app.use('/admin/whatsapp', authMiddleware, adminWhatsappRouter);
app.use('/public/self-reading', publicSelfReadingRouter);
app.use('/admin/agent-performance', agentPerformanceRouter);

// POST /agent/upload-url mapping directly if needed
// Let's also support POST /agent/upload-url route directly for consistency
app.post('/agent/upload-url', agentUploadRouter);

// Health check endpoint (used to keep Render.com awake)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.5' });
});


// Load BullMQ background worker
require('./workers/sync.worker');

// Error handler
app.use(errorHandler);

// Database initialization helper (run migrations on start)
const initDb = async () => {
  // Apply 001_init.sql
  try {
    const migrationPath = path.join(__dirname, '../migrations/001_init.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await db.query(sql);
      console.log('Database initialized successfully (001_init.sql applied).');
    }
  } catch (error) {
    console.error('Error applying 001_init.sql:', error.message);
  }

  // Helper to run individual migration queries safely
  const runQuery = async (name, sql) => {
    try {
      await db.query(sql);
      console.log(`✔ Migration applied: ${name}`);
    } catch (error) {
      console.error(`❌ Migration failed: ${name} (${error.message})`);
    }
  };

  // Run auto-migrate schema updates sequentially
  await runQuery('raw_sap_data', `ALTER TABLE properties ADD COLUMN IF NOT EXISTS raw_sap_data JSONB DEFAULT NULL;`);
  await runQuery('sub_society', `ALTER TABLE properties ADD COLUMN IF NOT EXISTS sub_society VARCHAR(255);`);
  await runQuery('wing_code', `ALTER TABLE properties ADD COLUMN IF NOT EXISTS wing_code VARCHAR(100);`);
  await runQuery('idx_properties_sub_society', `CREATE INDEX IF NOT EXISTS idx_properties_sub_society ON properties(sub_society);`);
  await runQuery('idx_properties_wing_code', `CREATE INDEX IF NOT EXISTS idx_properties_wing_code ON properties(wing_code);`);
  await runQuery('agents username', `ALTER TABLE agents ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE DEFAULT NULL;`);
  
  // WhatsApp outreach schema additions
  await runQuery('readings source', `ALTER TABLE readings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'agent';`);
  await runQuery('readings submitted_by_type', `ALTER TABLE readings ADD COLUMN IF NOT EXISTS submitted_by_type TEXT DEFAULT 'agent';`);
  await runQuery('properties phone_number', `ALTER TABLE properties ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) DEFAULT NULL;`);
  await runQuery('create whatsapp_logs', `
    CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID,
      phone_number TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await runQuery('whatsapp_logs token', `ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS token TEXT DEFAULT NULL;`);
  await runQuery('whatsapp_logs consumer_name', `ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS consumer_name TEXT DEFAULT NULL;`);
  await runQuery('whatsapp_logs cycle_id', `ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS cycle_id UUID DEFAULT NULL;`);
};

app.listen(PORT, async () => {
  console.log(`FieldWatt backend running on port ${PORT}`);
  await initDb();
});
