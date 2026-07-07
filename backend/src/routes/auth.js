const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { signToken, authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register — INTERNAL EMPLOYEES ONLY.
 * Only company employees (role = internal) may self-register. Customers and
 * suppliers do NOT self-register: an internal member creates their record and
 * issues a login (their business ID + a generated password). See
 * POST /api/customers and POST /api/suppliers.
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, full_name, phone } = req.body;
    const role = req.body.role || 'internal';
    if (role !== 'internal') {
      return res.status(403).json({
        error: 'Only internal employees can register. Customers and suppliers receive login credentials from the MMT team.',
      });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (role, email, password_hash, full_name, phone)
       VALUES ('internal', $1, $2, $3, $4)
       RETURNING id, role, email, full_name, phone, customer_id, supplier_id`,
      [email, password_hash, full_name || null, phone || null]
    );
    const user = rows[0];

    const token = signToken({
      id: user.id, role: user.role, customer_id: user.customer_id, supplier_id: user.supplier_id,
    });
    return res.status(201).json({ token, user });
  })
);

/**
 * POST /api/auth/login
 * `login` is an email (internal employees) OR a business ID — customer_id /
 * supplier_id (customers & suppliers). Backwards compatible with `email`.
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const identifier = (req.body.login || req.body.email || '').trim();
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'login (email or ID) and password are required' });
    }
    const { rows } = await query(
      `SELECT * FROM users WHERE email = $1 OR customer_id = $1 OR supplier_id = $1 LIMIT 1`,
      [identifier]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({
      id: user.id,
      role: user.role,
      customer_id: user.customer_id,
      supplier_id: user.supplier_id,
    });
    return res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        customer_id: user.customer_id,
        supplier_id: user.supplier_id,
      },
    });
  })
);

/**
 * GET /api/auth/me — current user + linked customer/supplier profile.
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, role, email, full_name, phone, customer_id, supplier_id, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let profile = null;
    if (user.role === 'customer' && user.customer_id) {
      const c = await query('SELECT * FROM customers WHERE customer_id = $1', [user.customer_id]);
      profile = c.rows[0] || null;
    } else if (user.role === 'supplier' && user.supplier_id) {
      const s = await query('SELECT * FROM suppliers WHERE supplier_id = $1', [user.supplier_id]);
      profile = s.rows[0] || null;
    }
    return res.json({ user, profile });
  })
);

module.exports = router;
