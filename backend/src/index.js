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

// Database initialization helper (verify D1 connection on start)
const initDb = async () => {
  try {
    await db.query('SELECT 1');
    console.log('✔ Cloudflare D1 connection verified successfully.');
  } catch (error) {
    console.error('❌ Cloudflare D1 connection failed:', error.message);
  }
};

app.listen(PORT, async () => {
  console.log(`FieldWatt backend running on port ${PORT}`);
  await initDb();
});
