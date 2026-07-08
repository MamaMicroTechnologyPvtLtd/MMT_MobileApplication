const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { pushCustomer } = require('../utils/notify');

const router = express.Router();

// Payments are settled OUTSIDE the app (bank transfer to the company account).
// The internal employee records the mode + details and updates the status here;
// the customer only views it.

/**
 * POST /api/payments  (Internal)
 * Raise an advance/final payment request against an order (or delivery).
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { order_id, delivery_id, customer_id, amount, type, method, reference, remark } = req.body;
    if (!customer_id || amount == null) {
      return res.status(400).json({ error: 'customer_id and amount are required' });
    }
    const { rows } = await query(
      `INSERT INTO payments (order_id, delivery_id, customer_id, amount, type, method, reference, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [order_id || null, delivery_id || null, customer_id, amount,
       type || 'advance', method || null, reference || null, remark || null]
    );
    await query(
      `INSERT INTO notifications (customer_id, type, title, body, data)
       VALUES ($1, 'payment', $2, $3, $4)`,
      [customer_id, `${(type || 'advance')} payment requested`,
       `Amount ₹${Number(amount).toLocaleString('en-IN')} — pay to the company account.`,
       JSON.stringify({ payment_id: rows[0].id, order_id })]
    );
    pushCustomer(customer_id, {
      title: `${type || 'advance'} payment requested`,
      body: `Amount ₹${Number(amount).toLocaleString('en-IN')} — pay to the company account.`,
      data: { type: 'payment', payment_id: rows[0].id, order_id },
    }).catch(() => {});
    return res.status(201).json(rows[0]);
  })
);

/**
 * GET /api/payments  (Customer: own; Internal: all)
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
 * PATCH /api/payments/:id  (Internal)
 * Update the payment: mode (method), transaction/details (reference/remark),
 * amount/type, and status (pending | paid | failed). Notifies the customer when
 * the status changes.
 */
router.patch(
  '/:id',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const fields = ['status', 'method', 'reference', 'remark', 'amount', 'type'];
    const allowedStatus = ['pending', 'processing', 'paid', 'failed'];
    if (req.body.status && !allowedStatus.includes(req.body.status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${i}`);
        params.push(req.body[f]);
        i += 1;
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = now()');
    params.push(req.params.id);

    const { rows } = await query(
      `UPDATE payments SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    const payment = rows[0];

    if (req.body.status) {
      const label = req.body.status === 'paid' ? 'received' : req.body.status;
      await query(
        `INSERT INTO notifications (customer_id, type, title, body, data)
         VALUES ($1, 'payment', $2, $3, $4)`,
        [payment.customer_id, `Payment ${label}`,
         `₹${Number(payment.amount).toLocaleString('en-IN')}${payment.method ? ` via ${payment.method}` : ''}`,
         JSON.stringify({ payment_id: payment.id, order_id: payment.order_id })]
      );
      pushCustomer(payment.customer_id, {
        title: `Payment ${label}`,
        body: `₹${Number(payment.amount).toLocaleString('en-IN')}`,
        data: { type: 'payment', payment_id: payment.id },
      }).catch(() => {});
    }
    return res.json(payment);
  })
);

module.exports = router;
