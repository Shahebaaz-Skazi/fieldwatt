const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const crypto = require('crypto');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleGuard');
const db = require('../../db');

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage config (ponytail: keep buffer footprint small by storing to disk)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

// Job tracking store (in-memory)
const importJobs = new Map();
// SSE active listeners
const activeListeners = new Map();

// Helper to notify active listeners of status changes
const notifyListeners = (jobId, data) => {
  const listeners = activeListeners.get(jobId) || [];
  listeners.forEach(res => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
};

// POST /admin/import - Ingest property data via uploaded Excel sheet (uses worker threads)
router.post('/', authMiddleware, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an Excel file.' });
    }

    const jobId = crypto.randomUUID();
    const filePath = req.file.path;
    const adminId = req.user.id;

    // Initialize job state
    const jobState = {
      id: jobId,
      status: 'pending',
      progress: 0,
      total: 0,
      error: null,
      filePath
    };
    importJobs.set(jobId, jobState);

    // Spawn worker thread
    const workerPath = path.join(__dirname, '../../workers/excel.worker.js');
    const worker = new Worker(workerPath, {
      workerData: { filePath, adminId, fileName: req.file.originalname }
    });

    worker.on('message', (msg) => {
      const job = importJobs.get(jobId);
      if (!job) return;

      if (msg.type === 'start') {
        job.status = 'processing';
        job.total = msg.total;
        job.importId = msg.importId;
        notifyListeners(jobId, { status: job.status, progress: job.progress, total: job.total, importId: job.importId });
      } else if (msg.type === 'progress') {
        job.progress = msg.progress;
        notifyListeners(jobId, { status: job.status, progress: job.progress, total: job.total, importId: job.importId });
      } else if (msg.type === 'done') {
        job.status = 'completed';
        job.importId = msg.importId;
        notifyListeners(jobId, { status: job.status, progress: job.total, total: job.total, importId: job.importId });
        // Clean up uploaded file
        fs.unlink(filePath, () => {});
        // ponytail: delay job deletion to let client disconnect from SSE gracefully
        setTimeout(() => {
          importJobs.delete(jobId);
        }, 10000);
      } else if (msg.type === 'error') {
        console.error('Excel worker process error message:', msg.error);
        job.status = 'failed';
        job.error = msg.error;
        notifyListeners(jobId, { status: 'failed', error: msg.error });
        fs.unlink(filePath, () => {});
        setTimeout(() => {
          importJobs.delete(jobId);
        }, 10000);
      }
    });

    worker.on('error', (err) => {
      console.error('Excel worker error:', err);
      const job = importJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err.message;
        notifyListeners(jobId, { status: 'failed', error: err.message });
      }
      fs.unlink(filePath, () => {});
      setTimeout(() => {
        importJobs.delete(jobId);
      }, 10000);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`Excel worker stopped with exit code ${code}`);
      }
    });

    res.json({ jobId, message: 'File uploaded and import job started.' });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
});

// GET /admin/import/:jobId/status - SSE stream of import progress
router.get('/:jobId/status', authMiddleware, requireAdmin, (req, res) => {
  const jobId = req.params.jobId;
  const job = importJobs.get(jobId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!job) {
    res.write(`data: ${JSON.stringify({ status: 'not_found', error: 'Job not found' })}\n\n`);
    return res.end();
  }

  // Register listener
  if (!activeListeners.has(jobId)) {
    activeListeners.set(jobId, []);
  }
  activeListeners.get(jobId).push(res);

  // Send initial state
  res.write(`data: ${JSON.stringify({ status: job.status, progress: job.progress, total: job.total, error: job.error })}\n\n`);

  req.on('close', () => {
    const listeners = activeListeners.get(jobId) || [];
    const index = listeners.indexOf(res);
    if (index > -1) {
      listeners.splice(index, 1);
    }
    if (listeners.length === 0) {
      activeListeners.delete(jobId);
    }
  });
});

// GET /admin/import/history - List previously uploaded sheets
router.get('/history', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT 
        i.id,
        i.file_name,
        i.file_code,
        i.scheduled_date,
        i.billing_month,
        i.total_rows,
        i.uploaded_at,
        a.name as uploader_name
      FROM imports i
      LEFT JOIN admins a ON i.uploaded_by = a.id
      ORDER BY i.uploaded_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// DELETE /admin/import/:importId - Purge properties and tracking record of an import
router.delete('/:importId', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { importId } = req.params;

    // Delete properties (which cascades to assignments and readings)
    await db.query('DELETE FROM properties WHERE import_id = $1', [importId]);

    // Delete import tracker record
    const result = await db.query('DELETE FROM imports WHERE id = $1 RETURNING file_name', [importId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Import record not found.' });
    }

    res.json({ message: `Successfully deleted import "${result.rows[0].file_name}" and all its imported properties.` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
