const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../db');
const authMiddleware = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleGuard');

const createAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(5, 'Phone number must be at least 5 digits'),
  email: z.preprocess((val) => (val === '' || val === undefined ? null : val), z.string().email('Invalid email address').optional().nullable()),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

const updateAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().min(5, 'Phone number must be at least 5 digits').optional(),
  email: z.preprocess((val) => (val === '' || val === undefined ? null : val), z.string().email('Invalid email address').optional().nullable()),
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
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
        a.username,
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
    const { name, phone, email, username, password } = createAgentSchema.parse(req.body);
    
    // Ensure agent username is unique
    const dupUser = await db.query('SELECT id FROM agents WHERE UPPER(username) = $1', [username.toUpperCase().trim()]);
    if (dupUser.rows.length > 0) {
      return res.status(400).json({ error: 'An agent with this username already exists.' });
    }

    // Ensure agent phone is unique
    const dupPhone = await db.query('SELECT id FROM agents WHERE phone = $1', [phone.trim()]);
    if (dupPhone.rows.length > 0) {
      return res.status(400).json({ error: 'An agent with this phone number already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    const result = await db.query(
      `INSERT INTO agents (name, phone, email, username, password_hash) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, phone, email, username, is_active, created_at`,
      [name, phone.trim(), email || null, username.toLowerCase().trim(), passwordHash]
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
    
    if (updates.username) {
      const duplicate = await db.query('SELECT id FROM agents WHERE UPPER(username) = $1 AND id <> $2', [updates.username.toUpperCase().trim(), agentId]);
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ error: 'An agent with this username already exists.' });
      }
    }

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
      RETURNING id, name, phone, email, username, is_active, last_login, created_at
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
       RETURNING id, name, username, is_active`,
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
