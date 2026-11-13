const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { syncQueue, connection } = require('../../dbQueue');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAgent } = require('../../middleware/roleGuard');
const { getDistance } = require('../../utils/geo');
const { detectAnomaly } = require('../../services/anomaly');

const readingItemSchema = z.object({
  assignment_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  reading_value: z.string().nullable().optional(),
  status_code: z.string().min(1),
  photo_url: z.string().nullable().optional(),
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
  const synced = [];
  const failed = [];

  if (!readings || readings.length === 0) {
    return { synced, failed };
  }

  // 1. Validate all assignments in ONE query instead of N individual round-trips
  const asgIds = readings.map(r => r.assignment_id);
  const placeholders = asgIds.map((_, i) => `$${i + 1}`).join(',');
  const queryText = role === 'admin'
    ? `SELECT a.id, a.property_id, p.lat, p.lng 
       FROM assignments a
       INNER JOIN properties p ON a.property_id = p.id
       WHERE a.id IN (${placeholders})`
    : `SELECT a.id, a.property_id, p.lat, p.lng 
       FROM assignments a
       INNER JOIN properties p ON a.property_id = p.id
       WHERE a.id IN (${placeholders}) AND a.agent_id = $${asgIds.length + 1}`;

  const queryParams = role === 'admin' ? asgIds : [...asgIds, agentId];
  const asgResult = await db.query(queryText, queryParams);

  const asgMap = new Map();
  for (const row of asgResult.rows) {
    asgMap.set(row.id, row);
  }

  // 2. Fetch previous readings for anomaly check in ONE query for all properties in batch
  const propIds = Array.from(new Set(asgResult.rows.map(r => r.property_id)));
  const prevReadingsMap = new Map();
  if (propIds.length > 0) {
    const propPlaceholders = propIds.map((_, i) => `$${i + 1}`).join(',');
    const prevRes = await db.query(
      `SELECT a.property_id, r.reading_value, r.submitted_at
       FROM readings r
       INNER JOIN assignments a ON r.assignment_id = a.id
       WHERE a.property_id IN (${propPlaceholders}) AND r.status_code = 'reading_taken'
       ORDER BY r.submitted_at DESC`,
      propIds
    );
    for (const row of prevRes.rows) {
      if (!prevReadingsMap.has(row.property_id)) {
        prevReadingsMap.set(row.property_id, row);
      }
    }
  }

  // 3. Build batched statements (insert readings + update assignments is_completed = 1)
  const statements = [];
  const validKeys = [];

  for (const reading of readings) {
    const property = asgMap.get(reading.assignment_id);
    if (!property) {
      failed.push({ idempotency_key: reading.idempotency_key, reason: 'assignment_not_found' });
      continue;
    }

    let isAnomalous = false;
    let anomalyReason = null;

    // GPS Proximity check
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

    // Anomaly check: check if reading is lower or excessively higher than previous reading
    if (reading.reading_value && reading.status_code === 'reading_taken') {
      const prev = prevReadingsMap.get(property.property_id);
      if (prev && prev.reading_value !== null) {
        const currValue = parseFloat(reading.reading_value);
        const prevValue = parseFloat(prev.reading_value);
        if (!isNaN(currValue) && !isNaN(prevValue)) {
          if (currValue < prevValue) {
            isAnomalous = true;
            anomalyReason = `Current reading (${currValue}) is lower than the previous reading (${prevValue}).`;
          } else if (currValue > prevValue * 2) {
            isAnomalous = true;
            anomalyReason = `Current reading (${currValue}) is abnormally high compared to previous reading (${prevValue}).`;
          }
        }
      }
    }

    statements.push({
      sql: `INSERT INTO readings (
        assignment_id, idempotency_key, reading_value, status_code, 
        photo_url, note, gps_lat, gps_lng, gps_accuracy, 
        is_anomalous, anomaly_reason, submitted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      params: [
        reading.assignment_id,
        reading.idempotency_key,
        reading.reading_value || null,
        reading.status_code,
        reading.photo_url || null,
        reading.note || null,
        reading.gps_lat || null,
        reading.gps_lng || null,
        reading.gps_accuracy || null,
        isAnomalous ? 1 : 0,
        anomalyReason,
        reading.submitted_at
      ]
    });

    // Mark assignment as completed
    statements.push({
      sql: `UPDATE assignments SET is_completed = 1 WHERE id = $1`,
      params: [reading.assignment_id]
    });

    validKeys.push(reading.idempotency_key);
  }

  // Execute in D1 transaction batch (chunks of max 100 statements to stay within D1 limit)
  if (statements.length > 0) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
      const slice = statements.slice(i, i + CHUNK_SIZE);
      await db.batch(slice);
    }
    synced.push(...validKeys);
  }

  return { synced, failed };
};

const cache = require('../../utils/cache');

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

    // Always process directly — Redis/BullMQ removed (Upstash free tier exhausted)
    const result = await processReadingsDirectly(agentId, readings, req.user.role);
    if (result.synced && result.synced.length > 0) {
      cache.invalidateAll();
    }
    res.status(202).json({
      message: 'Sync processed successfully.',
      synced: result.synced,
      failed: result.failed,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  processReadingsDirectly,
};
