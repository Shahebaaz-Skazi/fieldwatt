const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleGuard');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const agentLoginSchema = z.object({
  phone: z.string().min(5),
  password: z.string().min(6),
});

// POST /auth/admin/login
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    
    const token = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (error) {
    next(error);
  }
});

// POST /auth/agent/login (Supports both agent phone and admin email logins)
router.post('/agent/login', async (req, res, next) => {
  try {
    const { phone, username, password } = req.body;
    const loginIdentifier = (username || phone || '').toString().trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: 'Please enter username and password.' });
    }

    // Admin login redirect support
    if (loginIdentifier.includes('@')) {
      const result = await db.query('SELECT * FROM admins WHERE email = $1', [loginIdentifier.toLowerCase()]);
      const admin = result.rows[0];
      
      if (!admin) {
        return res.status(401).json({ error: 'Invalid admin email or password.' });
      }
      
      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid admin email or password.' });
      }
      
      const token = jwt.sign(
        { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      return res.json({ token, user: { id: admin.id, name: admin.name, phone: admin.email, role: admin.role } });
    }

    // Standard agent login (supports phone, username, and name matching)
    const result = await db.query(
      'SELECT * FROM agents WHERE (UPPER(username) = $1 OR UPPER(name) = $1 OR phone = $1) AND is_active = 1',
      [loginIdentifier.toUpperCase()]
    );
    const agent = result.rows[0];
    
    if (!agent) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    
    const isValid = await bcrypt.compare(password, agent.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    
    // Update last login
    await db.query('UPDATE agents SET last_login = NOW() WHERE id = $1', [agent.id]);
    
    const token = jwt.sign(
      { id: agent.id, name: agent.name, phone: agent.phone, role: 'agent' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ token, user: { id: agent.id, name: agent.name, phone: agent.phone, role: 'agent' } });
  } catch (error) {
    next(error);
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
});

// GET /auth/admin/viewers — list all viewer accounts (admin only)
router.get('/admin/viewers', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, created_at FROM admins WHERE role = 'viewer' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /auth/admin/create-viewer — only full admins can create viewer accounts
router.post('/admin/create-viewer', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const existing = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO admins (name, email, password_hash, role) VALUES ($1, $2, $3, 'viewer') RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );
    res.status(201).json({ success: true, viewer: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
