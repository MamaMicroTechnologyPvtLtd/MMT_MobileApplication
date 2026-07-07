const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/payments  (Internal)
 * Raise an advance/final payment request against an order (or delivery) once the
 * customer confirms the quotation.
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { order_id, delivery_id, customer_id, amount, type, method, reference } = req.body;
    if (!customer_id || amount == null) {
      return res.status(400).json({ error: 'customer_id and amount are required' });
    }
    const { rows } = await query(
      `INSERT INTO payments (order_id, delivery_id, customer_id, amount, type, method, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [order_id || null, delivery_id || null, customer_id, amount,
       type || 'advance', method || null, reference || null]
    );
    await query(
      `INSERT INTO notifications (customer_id, type, title, body, data)
       VALUES ($1, 'payment', $2, $3, $4)`,
      [customer_id, `${(type || 'advance')} payment requested`,
       `Amount ₹${Number(amount).toLocaleString('en-IN')}`,
       JSON.stringify({ payment_id: rows[0].id, order_id })]
    );
    return res.status(201).json(rows[0]);
  })
);

/**
 * GET /api/payments  (Customer: own; Internal: all)
 * Payments history.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { role, customer_id } = req.user;
    const params = [];
    let where = '';
    if (role === 'customer') {
      params.push(customer_id);
      where = 'WHERE p.customer_id = $1';
    }
    const { rows } = await query(
      `SELECT p.* FROM payments p ${where} ORDER BY p.created_at DESC`,
      params
    );
    return res.json(rows);
  })
);

/**
 * POST /api/payments/:id/pay  (Customer)
 * Marks an advance/final payment as paid (payment-gateway integration is a
 * later phase; this records the settlement).
 */
router.post(
  '/:id/pay',
  authenticate,
  asyncHandler(async (req, res) => {
    const { method, reference } = req.body;
    const { role, customer_id } = req.user;
    const guard = role === 'customer' ? 'AND customer_id = $4' : '';
    const params = [method || null, reference || null, req.params.id];
    if (role === 'customer') params.push(customer_id);

    const { rows } = await query(
      `UPDATE payments SET status = 'paid', method = $1, reference = $2, updated_at = now()
        WHERE id = $3 ${guard} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
