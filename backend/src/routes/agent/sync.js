const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { syncQueue } = require('../../dbQueue');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAgent } = require('../../middleware/roleGuard');
const { getDistance } = require('../../utils/geo');
const { detectAnomaly } = require('../../services/anomaly');

const readingItemSchema = z.object({
  assignment_id: z.string().uuid(),
  idempotency_key: z.string().uuid(),
  reading_value: z.number().nullable().optional(),
  status_code: z.enum([
    'reading_taken', 'door_locked', 'not_reachable',
    'access_denied', 'meter_not_found', 'meter_damaged',
    'revisit_needed', 'vacant_property'
  ]),
  photo_url: z.string().url().nullable().optional(),
  note: z.string().optional().nullable(),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
  gps_accuracy: z.number().nullable().optional(),
  submitted_at: z.string(),
  override_gps: z.boolean().optional().default(false),
});

const syncBatchSchema = z.object({
  readings: z.array(readingItemSchema),
});

// Helper function to process readings directly in case Redis/BullMQ is down
const processReadingsDirectly = async (agentId, readings, role = 'agent') => {
  const results = [];
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const reading of readings) {
      // 1. Check if assignment belongs to this agent (admins bypass agent ownership checks)
      const queryText = role === 'admin'
        ? `SELECT a.id, a.property_id, p.lat, p.lng 
           FROM assignments a
           INNER JOIN properties p ON a.property_id = p.id
           WHERE a.id = $1`
        : `SELECT a.id, a.property_id, p.lat, p.lng 
           FROM assignments a
           INNER JOIN properties p ON a.property_id = p.id
           WHERE a.id = $1 AND a.agent_id = $2`;
      const queryParams = role === 'admin' ? [reading.assignment_id] : [reading.assignment_id, agentId];
      
      const asgResult = await client.query(queryText, queryParams);

      if (asgResult.rows.length === 0) {
        continue; // Skip unauthorized assignments
      }

      const property = asgResult.rows[0];
      let isAnomalous = false;
      let anomalyReason = null;

      // 2. Proximity GPS validation
      if (property.lat && property.lng && reading.gps_lat && reading.gps_lng && !reading.override_gps) {
        const distance = getDistance(
          parseFloat(property.lat), 
          parseFloat(property.lng), 
          reading.gps_lat, 
          reading.gps_lng
        );
        
        if (distance !== null && distance > 100) {
          isAnomalous = true;
          anomalyReason = `GPS Proximity check failed: Agent was ${Math.round(distance)}m away from property.`;
        }
      }

      // 3. Simple anomaly: check if reading is lower than previous reading
      if (reading.reading_value && reading.status_code === 'reading_taken') {
        const anomalyCheck = await detectAnomaly(
          property.property_id, 
          reading.reading_value, 
          reading.submitted_at
        );
        
        if (anomalyCheck.isAnomalous) {
          isAnomalous = true;
          anomalyReason = anomalyReason 
            ? `${anomalyReason}; ${anomalyCheck.reason}` 
            : anomalyCheck.reason;
        }
      }

      // 4. Save reading with idempotency key safety
      await client.query(
        `INSERT INTO readings (
          assignment_id, idempotency_key, reading_value, status_code, 
          photo_url, note, gps_lat, gps_lng, gps_accuracy, 
          is_anomalous, anomaly_reason, submitted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          reading.assignment_id,
          reading.idempotency_key,
          reading.reading_value || null,
          reading.status_code,
          reading.photo_url || null,
          reading.note || null,
          reading.gps_lat || null,
          reading.gps_lng || null,
          reading.gps_accuracy || null,
          isAnomalous,
          anomalyReason,
          reading.submitted_at
        ]
      );
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// POST /sync/batch - Accept offline readings batch (max 50)
router.post('/batch', authMiddleware, requireAgent, async (req, res, next) => {
  try {
    const { readings } = syncBatchSchema.parse(req.body);

    if (readings.length > 50) {
      return res.status(400).json({ error: 'Max 50 readings per batch.' });
    }

    if (readings.length === 0) {
      return res.status(400).json({ error: 'Readings array must not be empty.' });
    }

    const agentId = req.user.id;

    // Drop to Redis sync queue if queue is active
    if (syncQueue) {
      await syncQueue.add('process-sync-readings', {
        agentId,
        readings,
        role: req.user.role,
      });
      return res.status(202).json({ message: 'Sync queued successfully for processing.' });
    }

    // Fallback: process directly to db in case Redis queue is down/not configured
    // ponytail: fallback to direct db transactions
    await processReadingsDirectly(agentId, readings, req.user.role);
    res.status(202).json({ message: 'Sync processed successfully directly to database.' });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  processReadingsDirectly,
};
