const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleGuard');

// GET /admin/areas/files - Level 1: Get file codes summary
router.get('/files', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT 
        file_code,
        COUNT(id)::int as file_count,
        SUM(total_rows)::int as total_records,
        MAX(uploaded_at) as last_uploaded
      FROM imports
      GROUP BY file_code
      ORDER BY file_code ASC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/areas/files/:fileCode/months - Level 2: Get months under file code
router.get('/files/:fileCode/months', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT 
        id as import_id,
        billing_month,
        scheduled_date,
        total_rows,
        uploaded_at
      FROM imports
      WHERE file_code = $1
      ORDER BY scheduled_date DESC
    `, [req.params.fileCode]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/areas/imports/:importId/areas - Level 3: Get areas under import id
router.get('/imports/:importId/areas', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const importId = req.params.importId;
    // Single query: resolve cycle via CTE, eliminating 2 sequential round-trips
    const result = await db.query(`
      WITH imp AS (
        SELECT billing_month FROM imports WHERE id = $1
      ),
      cyc AS (
        SELECT c.id FROM cycles c JOIN imp ON c.label = imp.billing_month LIMIT 1
      )
      SELECT 
        a.id, 
        a.name, 
        a.city,
        COUNT(p.id)::int as total_properties,
        COUNT(CASE WHEN p.property_type = 'flat' THEN 1 END)::int as flat_count,
        COUNT(CASE WHEN p.property_type = 'bungalow' THEN 1 END)::int as bungalow_count,
        COUNT(CASE WHEN p.property_type = 'raw_house' THEN 1 END)::int as raw_house_count,
        COUNT(asg.id)::int as assigned_properties
      FROM areas a
      INNER JOIN properties p ON a.id = p.area_id AND p.import_id = $1
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = (SELECT id FROM cyc)
      GROUP BY a.id, a.name, a.city
      ORDER BY a.name ASC
    `, [importId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Import not found or no areas' });
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/areas/imports/:importId/areas/:areaId/seats - Level 4: Get seats inside area for import id
router.get('/imports/:importId/areas/:areaId/seats', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { importId, areaId } = req.params;
    // Single query: resolve cycle via CTE, eliminating 2 sequential round-trips
    const result = await db.query(`
      WITH cyc AS (
        SELECT c.id FROM cycles c
        JOIN imports i ON c.label = i.billing_month
        WHERE i.id = $1 LIMIT 1
      )
      SELECT
        p.id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.lat,
        p.lng,
        p.society,
        (SELECT id FROM cyc) AS cycle_id,
        asg.id          AS assignment_id,
        ag.name         AS agent_name,
        ag.id           AS agent_id,
        r.id            AS reading_id,
        r.status_code   AS reading_status,
        r.reading_value,
        r.photo_url,
        r.submitted_at  AS reading_submitted_at,
        r.gps_lat,
        r.gps_lng
      FROM properties p
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = (SELECT id FROM cyc)
      LEFT JOIN agents ag ON ag.id = asg.agent_id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE p.import_id = $1 AND p.area_id = $2
      ORDER BY p.serial_no ASC
      LIMIT 5000
    `, [importId, areaId]);

    res.json({
      properties: result.rows,
      cycleId: result.rows[0]?.cycle_id || null
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/areas/imports/:importId/areas/:areaId/societies - Level 4: Get distinct societies in area
router.get('/imports/:importId/areas/:areaId/societies', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { importId, areaId } = req.params;
    const result = await db.query(`
      SELECT DISTINCT society
      FROM properties
      WHERE import_id = $1 AND area_id = $2 AND society IS NOT NULL
      ORDER BY society ASC
    `, [importId, areaId]);
    res.json(result.rows.map(r => r.society));
  } catch (err) {
    next(err);
  }
});

// GET /admin/areas - List all areas with total properties and by property type
router.get('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const queryText = `
      SELECT 
        a.id, 
        a.name, 
        a.city,
        COUNT(p.id)::int as total_properties,
        COUNT(CASE WHEN p.property_type = 'flat' THEN 1 END)::int as flat_count,
        COUNT(CASE WHEN p.property_type = 'bungalow' THEN 1 END)::int as bungalow_count,
        COUNT(CASE WHEN p.property_type = 'raw_house' THEN 1 END)::int as raw_house_count
      FROM areas a
      LEFT JOIN properties p ON a.id = p.area_id
      GROUP BY a.id
      ORDER BY a.name ASC
    `;
    const result = await db.query(queryText);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/areas/:id/properties - Get properties in an area (paginated, filtered, searched)
router.get('/:id/properties', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const areaId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { type, status, search, cycle_id } = req.query;

    // Get active cycle if cycle_id is not specified
    let cycleId = cycle_id;
    if (!cycleId) {
      const activeCycleResult = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
      if (activeCycleResult.rows.length > 0) {
        cycleId = activeCycleResult.rows[0].id;
      }
    }

    if (!cycleId) {
      return res.status(400).json({ error: 'No active cycle found.' });
    }

    // Dynamic parameter builder to keep indices contiguous and prevent bind exceptions
    let whereParams = [];
    const addWhereParam = (val) => {
      whereParams.push(val);
      return `$${whereParams.length}`;
    };

    const pAreaId = addWhereParam(areaId);
    let queryConditions = [`p.area_id = ${pAreaId}`];

    if (type) {
      const pType = addWhereParam(type);
      queryConditions.push(`p.property_type = ${pType}`);
    }

    if (search) {
      const pSearch = addWhereParam(`%${search}%`);
      queryConditions.push(`(p.consumer_name ILIKE ${pSearch} OR p.meter_no ILIKE ${pSearch} OR p.serial_no ILIKE ${pSearch})`);
    }

    if (status) {
      const pCycleId = addWhereParam(cycleId);
      if (status === 'pending') {
        queryConditions.push(`
          (
            NOT EXISTS (
              SELECT 1 FROM assignments asg 
              WHERE asg.property_id = p.id AND asg.cycle_id = ${pCycleId}
            )
            OR EXISTS (
              SELECT 1 FROM assignments asg 
              LEFT JOIN readings r ON r.assignment_id = asg.id
              WHERE asg.property_id = p.id AND asg.cycle_id = ${pCycleId} AND r.id IS NULL
            )
          )
        `);
      } else if (status === 'done') {
        queryConditions.push(`
          EXISTS (
            SELECT 1 FROM assignments asg 
            INNER JOIN readings r ON r.assignment_id = asg.id
            WHERE asg.property_id = p.id AND asg.cycle_id = ${pCycleId} AND r.status_code = 'reading_taken'
          )
        `);
      } else if (status === 'problem') {
        queryConditions.push(`
          EXISTS (
            SELECT 1 FROM assignments asg 
            INNER JOIN readings r ON r.assignment_id = asg.id
            WHERE asg.property_id = p.id AND asg.cycle_id = ${pCycleId} AND r.status_code != 'reading_taken'
          )
        `);
      }
    }

    const whereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';

    // Count query
    const countQuery = `
      SELECT COUNT(p.id)::int as total
      FROM properties p
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, whereParams);
    const total = countResult.rows[0].total;

    // Data query with assignment and reading status
    let selectFields = `
      p.id, 
      p.serial_no, 
      p.consumer_name, 
      p.address, 
      p.meter_no, 
      p.property_type, 
      p.lat, 
      p.lng,
      asg.id as assignment_id,
      asg.agent_id,
      ag.name as agent_name,
      r.id as reading_id,
      r.reading_value,
      r.status_code as reading_status,
      r.photo_url,
      r.submitted_at as reading_submitted_at
    `;

    // Clone whereParams to append cycleId, limit, and offset for dataQuery
    const dataQueryParams = [...whereParams];
    const pCycleIdForJoin = `$${dataQueryParams.length + 1}`;
    dataQueryParams.push(cycleId);

    const pLimit = `$${dataQueryParams.length + 1}`;
    const pOffset = `$${dataQueryParams.length + 2}`;
    dataQueryParams.push(limit, offset);

    const dataQuery = `
      SELECT ${selectFields}
      FROM properties p
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = ${pCycleIdForJoin}
      LEFT JOIN agents ag ON ag.id = asg.agent_id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      ${whereClause}
      ORDER BY p.serial_no ASC
      LIMIT ${pLimit} OFFSET ${pOffset}
    `;

    const dataResult = await db.query(dataQuery, dataQueryParams);

    res.json({
      properties: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/areas/:id/seats — lightweight full list for theater grid (no pagination, max 5000)
router.get('/:id/seats', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const areaId = req.params.id;

    // Get active cycle
    const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    const cycleId = cycleRes.rows.length > 0 ? cycleRes.rows[0].id : null;

    const result = await db.query(`
      SELECT
        p.id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.lat,
        p.lng,
        asg.id          AS assignment_id,
        ag.name         AS agent_name,
        ag.id           AS agent_id,
        r.id            AS reading_id,
        r.status_code   AS reading_status,
        r.reading_value,
        r.photo_url,
        r.submitted_at  AS reading_submitted_at,
        r.gps_lat,
        r.gps_lng
      FROM properties p
      LEFT JOIN assignments asg ON asg.property_id = p.id AND ($2::uuid IS NULL OR asg.cycle_id = $2)
      LEFT JOIN agents ag ON ag.id = asg.agent_id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE p.area_id = $1
      ORDER BY p.serial_no ASC
      LIMIT 5000
    `, [areaId, cycleId]);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/areas/property/:propId — full detail for the slide-in panel
router.get('/property/:propId', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    const cycleId = cycleRes.rows.length > 0 ? cycleRes.rows[0].id : null;

    const result = await db.query(`
      SELECT
        p.*,
        a.name          AS area_name,
        asg.id          AS assignment_id,
        ag.name         AS agent_name,
        ag.phone        AS agent_phone,
        r.id            AS reading_id,
        r.status_code   AS reading_status,
        r.reading_value,
        r.photo_url,
        r.note          AS reading_note,
        r.submitted_at  AS reading_submitted_at,
        r.gps_lat,
        r.gps_lng,
        r.gps_accuracy
      FROM properties p
      LEFT JOIN areas a ON a.id = p.area_id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND ($2::uuid IS NULL OR asg.cycle_id = $2)
      LEFT JOIN agents ag ON ag.id = asg.agent_id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE p.id = $1
    `, [req.params.propId, cycleId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// POST /admin/areas/upload-photo - Upload photo for admin logs
// ponytail: save files locally in development to avoid Supabase credentials/storage setup overhead
router.post('/upload-photo', authMiddleware, requireAdmin, upload.single('photo'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a photo.' });
    }
    const publicUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    res.json({ photoUrl: publicUrl });
  } catch (err) {
    next(err);
  }
});

// POST /admin/areas/property/:propId/reading - Admin logs a reading directly
// ponytail: automatically resolve or create cycles/assignments inline for direct logging
router.post('/property/:propId/reading', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const propId = req.params.propId;
    const { status_code, reading_value, note, photo_url } = req.body;

    const cycleResult = await db.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    if (cycleResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active billing cycle found.' });
    }
    const cycleId = cycleResult.rows[0].id;

    let assignmentId = null;
    const asgResult = await db.query(
      'SELECT id FROM assignments WHERE property_id = $1 AND cycle_id = $2 LIMIT 1',
      [propId, cycleId]
    );

    if (asgResult.rows.length > 0) {
      assignmentId = asgResult.rows[0].id;
    } else {
      const newAsg = await db.query(
        `INSERT INTO assignments (property_id, cycle_id, assigned_by)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [propId, cycleId, req.user.id]
      );
      assignmentId = newAsg.rows[0].id;
    }

    const readingResult = await db.query(
      'SELECT id FROM readings WHERE assignment_id = $1 LIMIT 1',
      [assignmentId]
    );

    if (readingResult.rows.length > 0) {
      await db.query(`
        UPDATE readings
        SET reading_value = $1,
            status_code = $2,
            photo_url = $3,
            note = $4,
            submitted_at = NOW()
        WHERE assignment_id = $5
      `, [
        reading_value !== undefined && reading_value !== '' ? parseFloat(reading_value) : null,
        status_code,
        photo_url || null,
        note || null,
        assignmentId
      ]);
    } else {
      await db.query(`
        INSERT INTO readings (
          assignment_id, idempotency_key, reading_value, status_code, photo_url, note, submitted_at
        ) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, NOW())
      `, [
        assignmentId,
        reading_value !== undefined && reading_value !== '' ? parseFloat(reading_value) : null,
        status_code,
        photo_url || null,
        note || null
      ]);
    }

    res.json({ message: 'Reading logged successfully by admin.', assignmentId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
