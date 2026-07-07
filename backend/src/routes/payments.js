const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { pushCustomer } = require('../utils/notify');
const razorpay = require('../utils/razorpay');

const router = express.Router();

// Load a payment and enforce that a customer can only touch their own.
async function loadOwnedPayment(req) {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
  const payment = rows[0];
  if (!payment) return { error: { status: 404, message: 'Payment not found' } };
  if (req.user.role === 'customer' && payment.customer_id !== req.user.customer_id) {
    return { error: { status: 403, message: 'Forbidden' } };
  }
  return { payment };
}

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
    pushCustomer(customer_id, {
      title: `${type || 'advance'} payment requested`,
      body: `Amount ₹${Number(amount).toLocaleString('en-IN')}`,
      data: { type: 'payment', payment_id: rows[0].id, order_id },
    }).catch(() => {});
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
 * POST /api/payments/:id/create-order  (Customer)
 * Start a gateway checkout. With Razorpay configured, creates a real order and
 * returns { mode:'razorpay', key_id, gateway_order_id, amount, currency } for
 * the checkout SDK. Without keys, returns { mode:'mock' } so the flow can be
 * completed in development.
 */
router.post(
  '/:id/create-order',
  authenticate,
  asyncHandler(async (req, res) => {
    const { payment, error } = await loadOwnedPayment(req);
    if (error) return res.status(error.status).json({ error: error.message });
    if (payment.status === 'paid') return res.status(409).json({ error: 'Already paid' });

    if (!razorpay.configured()) {
      return res.json({ mode: 'mock', payment_id: payment.id, amount: Number(payment.amount), currency: 'INR' });
    }

    const order = await razorpay.createOrder(payment.amount, `pay_${payment.id}`);
    await query(
      `UPDATE payments SET gateway_order_id = $1, method = 'razorpay', status = 'processing', updated_at = now()
        WHERE id = $2`,
      [order.id, payment.id]
    );
    return res.json({
      mode: 'razorpay',
      key_id: razorpay.KEY_ID,
      gateway_order_id: order.id,
      payment_id: payment.id,
      amount: order.amount, // paise
      currency: order.currency,
    });
  })
);

/**
 * POST /api/payments/:id/verify  (Customer)
 * Complete the checkout. Razorpay mode verifies the signature
 * ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }); mock mode
 * ({ mock:true }) simply settles it. On success the payment is marked paid.
 */
router.post(
  '/:id/verify',
  authenticate,
  asyncHandler(async (req, res) => {
    const { payment, error } = await loadOwnedPayment(req);
    if (error) return res.status(error.status).json({ error: error.message });
    if (payment.status === 'paid') return res.json(payment);

    let reference = null;
    if (razorpay.configured()) {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing Razorpay verification fields' });
      }
      if (razorpay_order_id !== payment.gateway_order_id) {
        return res.status(400).json({ error: 'Order mismatch' });
      }
      if (!razorpay.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        await query(`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1`, [payment.id]);
        return res.status(400).json({ error: 'Signature verification failed' });
      }
      reference = razorpay_payment_id;
    } else if (!req.body.mock) {
      return res.status(400).json({ error: 'mock:true required in mock mode' });
    }

    const { rows } = await query(
      `UPDATE payments SET status = 'paid', reference = COALESCE($1, reference),
              method = COALESCE(method, $2), updated_at = now()
        WHERE id = $3 RETURNING *`,
      [reference, razorpay.configured() ? 'razorpay' : 'mock', payment.id]
    );
    return res.json(rows[0]);
  })
);

/**
 * POST /api/payments/:id/pay  (Customer)
 * Simple manual settlement (records method/reference) — kept for offline
 * payments recorded by staff.
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
