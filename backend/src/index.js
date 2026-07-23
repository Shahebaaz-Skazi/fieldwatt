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

// POST /agent/upload-url mapping directly if needed
// Let's also support POST /agent/upload-url route directly for consistency
app.post('/agent/upload-url', agentUploadRouter);

// Health check endpoint (used to keep Render.com awake)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Load BullMQ background worker
require('./workers/sync.worker');

// Error handler
app.use(errorHandler);

// Database initialization helper (run migrations on start)
const initDb = async () => {
  try {
    const migrationPath = path.join(__dirname, '../migrations/001_init.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await db.query(sql);
      console.log('Database initialized successfully (migrations applied).');
    }
    // Auto-migrate schema updates (e.g. raw_sap_data column)
    await db.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS raw_sap_data JSONB DEFAULT NULL;`);
    await db.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS sub_society VARCHAR(255);`);
    await db.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS wing_code VARCHAR(100);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_sub_society ON properties(sub_society);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_wing_code ON properties(wing_code);`);
    await db.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE DEFAULT NULL;`);
    console.log('Database schema updates checked/applied.');
  } catch (error) {
    console.error('Failed to apply database migrations/updates:', error);
  }
};

app.listen(PORT, async () => {
  console.log(`FieldWatt backend running on port ${PORT}`);
  await initDb();
});
