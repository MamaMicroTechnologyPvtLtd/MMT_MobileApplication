const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextCustomerId } = require('../utils/idGenerator');

const router = express.Router();

// Columns an Internal member (or the customer, for their own record) may update.
const EDITABLE = [
  'first_name', 'last_name', 'customer_gst', 'email', 'address', 'street',
  'city', 'state', 'country', 'pincode', 'landline', 'mobile_num', 'alt_mobile',
  'pan_no', 'aadhar_number', 'bank_account_number', 'customer_type',
  'sub_customer_type', 'latitude', 'longitude', 'status', 'remark',
];

function buildUpdate(body, startIndex) {
  const sets = [];
  const params = [];
  let i = startIndex;
  for (const col of EDITABLE) {
    if (body[col] !== undefined) {
      sets.push(`${col} = $${i}`);
      params.push(body[col]);
      i += 1;
    }
  }
  return { sets, params, nextIndex: i };
}

/**
 * GET /api/customers  (Internal) — list / search, filterable by pincode.
 * Powers "choose existing customer" in the Internal interface.
 */
router.get(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { pincode, q, limit = 50 } = req.query;
    const clauses = [];
    const params = [];
    if (pincode) {
      params.push(pincode);
      clauses.push(`pincode = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length}
                     OR customer_id ILIKE $${params.length} OR mobile_num ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 50, 200));
    const { rows } = await query(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json(rows);
  })
);

/**
 * POST /api/customers  (Internal) — add a new customer (continues C-series).
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const customer = await withTransaction(async (client) => {
      const customerId = await nextCustomerId(client);
      const cols = ['customer_id'];
      const vals = [customerId];
      for (const col of EDITABLE) {
        if (req.body[col] !== undefined) {
          cols.push(col);
          vals.push(req.body[col]);
        }
      }
      const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO customers (${cols.join(', ')}, updated_by)
         VALUES (${placeholders}, $${vals.length + 1}) RETURNING *`,
        [...vals, String(req.user.id)]
      );
      return rows[0];
    });
    return res.status(201).json(customer);
  })
);

/**
 * GET /api/customers/:id — internal (any) or customer (own).
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'customer' && req.user.customer_id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await query('SELECT * FROM customers WHERE customer_id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    return res.json(rows[0]);
  })
);

/**
 * PUT /api/customers/:id — edit (Internal for any; customer for own profile).
 * This is the "Edit option" that keeps region details up to date.
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'customer' && req.user.customer_id !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { sets, params, nextIndex } = buildUpdate(req.body, 1);
    if (sets.length === 0) return res.status(400).json({ error: 'No editable fields provided' });

    sets.push(`updated_by = $${nextIndex}`);
    params.push(String(req.user.id));
    sets.push('updated_at = now()');
    params.push(req.params.id);

    const { rows } = await query(
      `UPDATE customers SET ${sets.join(', ')} WHERE customer_id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
