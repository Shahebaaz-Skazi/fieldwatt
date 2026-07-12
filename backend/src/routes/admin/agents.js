const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleGuard');

const createAgentSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6),
});

const updateAgentSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(5).optional(),
  email: z.string().email().optional().nullable(),
  is_active: z.boolean().optional(),
});

// GET /admin/agents - List all agents with simple aggregates
router.get('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const queryText = `
      SELECT 
        a.id, 
        a.name, 
        a.phone, 
        a.email, 
        a.is_active, 
        a.last_login,
        a.created_at
      FROM agents a
      ORDER BY a.name ASC
    `;
    const result = await db.query(queryText);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /admin/agents - Create a new agent
router.post('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { name, phone, email, password } = createAgentSchema.parse(req.body);
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    const result = await db.query(
      `INSERT INTO agents (name, phone, email, password_hash) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, phone, email, is_active, created_at`,
      [name, phone, email || null, passwordHash]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /admin/agents/:id - Update agent details
router.patch('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const updates = updateAgentSchema.parse(req.body);
    
    // Build dynamic query
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }
    
    values.push(agentId);
    const queryText = `
      UPDATE agents 
      SET ${fields.join(', ')} 
      WHERE id = $${index} 
      RETURNING id, name, phone, email, is_active, last_login, created_at
    `;
    
    const result = await db.query(queryText, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /admin/agents/:id - Deactivate agent (soft delete)
router.delete('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const result = await db.query(
      `UPDATE agents 
       SET is_active = false 
       WHERE id = $1 
       RETURNING id, name, is_active`,
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
    
    res.json({ message: 'Agent deactivated successfully.', agent: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
