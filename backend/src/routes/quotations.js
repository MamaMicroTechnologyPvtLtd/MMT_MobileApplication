const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/quotations  (Customer)
 * "receive the quotation for the enquiry from internal member" + quotation history.
 */
router.get(
  '/',
  authenticate,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT q.*, o.requirement, o.enquiry_id, e.subject, e.category
         FROM customer_quotations q
         JOIN orders o ON o.order_id = q.order_id
         LEFT JOIN enquiries e ON e.enquiry_id = o.enquiry_id
        WHERE q.customer_id = $1
        ORDER BY q.created_at DESC`,
      [req.user.customer_id]
    );
    return res.json(rows);
  })
);

/**
 * GET /api/quotations/:id  (Customer owner)
 */
router.get(
  '/:id',
  authenticate,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM customer_quotations WHERE quotation_id = $1 AND customer_id = $2`,
      [req.params.id, req.user.customer_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Quotation not found' });
    return res.json(rows[0]);
  })
);

/**
 * POST /api/quotations/:id/respond  (Customer)
 * Confirm or reject a received quotation.
 */
router.post(
  '/:id/respond',
  authenticate,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { decision } = req.body; // 'confirm' | 'reject'
    if (!['confirm', 'reject'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'confirm' or 'reject'" });
    }
    const status = decision === 'confirm' ? 'confirmed' : 'rejected';
    const { rows } = await query(
      `UPDATE customer_quotations SET status = $1, updated_at = now()
        WHERE quotation_id = $2 AND customer_id = $3 RETURNING *`,
      [status, req.params.id, req.user.customer_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Quotation not found' });

    // On confirm, advance the order so Internal can request advance payment.
    if (status === 'confirmed') {
      await query(
        `UPDATE orders SET status = 'confirmed', updated_at = now() WHERE order_id = $1`,
        [rows[0].order_id]
      );
    }
    return res.json(rows[0]);
  })
);

module.exports = router;
