const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextSupplierId } = require('../utils/idGenerator');

const router = express.Router();

const EDITABLE = [
  'supplier_firm_name', 'contact_person_name', 'email', 'address', 'city', 'state',
  'country', 'pincode', 'ward', 'zone', 'landline', 'mobile', 'alt_number',
  'fax_num', 'current_gst_info', 'pan_number', 'aadhar_number', 'account_number',
  'account_holder_name', 'ifsc', 'branch', 'bank_name', 'supplier_type', 'status',
];

/**
 * GET /api/suppliers  (Internal)
 * Filter by pincode — powers "enter the pincode and get all suppliers at that
 * locality" so the Internal member can pick up to 30.
 */
router.get(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { pincode, q, limit = 100 } = req.query;
    const clauses = [];
    const params = [];
    if (pincode) {
      params.push(pincode);
      clauses.push(`pincode = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(supplier_firm_name ILIKE $${params.length}
                     OR contact_person_name ILIKE $${params.length}
                     OR supplier_id ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 100, 300));
    const { rows } = await query(
      `SELECT * FROM suppliers ${where} ORDER BY supplier_firm_name NULLS LAST LIMIT $${params.length}`,
      params
    );
    return res.json(rows);
  })
);

/**
 * POST /api/suppliers  (Internal) — add new supplier (continues S-series).
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const supplier = await withTransaction(async (client) => {
      const supplierId = await nextSupplierId(client);
      const cols = ['supplier_id'];
      const vals = [supplierId];
      for (const col of EDITABLE) {
        if (req.body[col] !== undefined) {
          cols.push(col);
          vals.push(req.body[col]);
        }
      }
      const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO suppliers (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      return rows[0];
    });
    return res.status(201).json(supplier);
  })
);

/**
 * GET /api/suppliers/:id
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'supplier' && req.user.supplier_id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await query('SELECT * FROM suppliers WHERE supplier_id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(rows[0]);
  })
);

/**
 * POST /api/suppliers/:id/account  (Internal)
 * Create a login for a supplier so they can access the Supplier interface.
 * Onboarding is done by the internal member (matches the workflow).
 */
router.post(
  '/:id/account',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const sup = await query('SELECT supplier_id, supplier_firm_name FROM suppliers WHERE supplier_id = $1', [req.params.id]);
    if (sup.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });

    const taken = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (taken.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const linked = await query('SELECT id FROM users WHERE supplier_id = $1', [req.params.id]);
    if (linked.rows.length > 0) return res.status(409).json({ error: 'This supplier already has a login' });

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (role, email, password_hash, full_name, supplier_id)
       VALUES ('supplier', $1, $2, $3, $4)
       RETURNING id, role, email, full_name, supplier_id`,
      [email, password_hash, sup.rows[0].supplier_firm_name || null, req.params.id]
    );
    return res.status(201).json({ user: rows[0] });
  })
);

/**
 * GET /api/suppliers/:id/account  (Internal) — whether a login exists.
 */
router.get(
  '/:id/account',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, email, created_at FROM users WHERE supplier_id = $1',
      [req.params.id]
    );
    return res.json({ has_login: rows.length > 0, account: rows[0] || null });
  })
);

/**
 * PUT /api/suppliers/:id — edit (Internal; or supplier for own profile).
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'supplier' && req.user.supplier_id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const sets = [];
    const params = [];
    let i = 1;
    for (const col of EDITABLE) {
      if (req.body[col] !== undefined) {
        sets.push(`${col} = $${i}`);
        params.push(req.body[col]);
        i += 1;
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No editable fields provided' });
    sets.push('updated_at = now()');
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE suppliers SET ${sets.join(', ')} WHERE supplier_id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
