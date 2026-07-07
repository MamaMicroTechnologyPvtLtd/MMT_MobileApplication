const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { signToken, authenticate } = require('../middleware/auth');
const { nextCustomerId } = require('../utils/idGenerator');

const router = express.Router();

/**
 * POST /api/auth/register
 * Registers a login. For role=customer we also create a customer record and
 * allocate the next customer id in the continued series. Internal/supplier
 * self-registration is allowed but suppliers/internal records are normally
 * created by an Internal member (see /api/suppliers).
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, full_name, phone, role = 'customer' } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (!['customer', 'internal', 'supplier'].includes(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await withTransaction(async (client) => {
      let customerId = null;
      if (role === 'customer') {
        customerId = await nextCustomerId(client);
        // split name into first/last for the customer record
        const [firstName, ...rest] = (full_name || '').trim().split(' ');
        await client.query(
          `INSERT INTO customers (customer_id, first_name, last_name, email, mobile_num)
           VALUES ($1, $2, $3, $4, $5)`,
          [customerId, firstName || full_name || null, rest.join(' ') || null, email, phone || null]
        );
      }

      const { rows } = await client.query(
        `INSERT INTO users (role, email, password_hash, full_name, phone, customer_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, role, email, full_name, phone, customer_id, supplier_id`,
        [role, email, password_hash, full_name || null, phone || null, customerId]
      );
      return rows[0];
    });

    const token = signToken({
      id: user.id,
      role: user.role,
      customer_id: user.customer_id,
      supplier_id: user.supplier_id,
    });
    return res.status(201).json({ token, user });
  })
);

/**
 * POST /api/auth/login
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
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
