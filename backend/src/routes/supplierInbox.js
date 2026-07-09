const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/supplier/requirements  (Supplier)
 * Every requirement sent to the logged-in supplier, with the order details and
 * the supplier's own latest quotation for that order. `stage` reflects what the
 * Internal team currently wants: 'requirement' (initial quote), 'final_quotation'
 * or 'final_po'.
 */
router.get(
  '/requirements',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { supplier_id } = req.user;
    if (!supplier_id) return res.status(400).json({ error: 'No supplier linked to this account' });

    const { rows } = await query(
      `SELECT os.order_id, os.stage, os.status AS request_status, os.sent_at, os.po_url,
              o.requirement, o.note, o.quantity, o.price_range, o.pincode,
              o.category, o.subcategory, o.status AS order_status,
              (SELECT sc.fields FROM subcategories sc JOIN categories c2 ON c2.id = sc.category_id
                WHERE c2.name = o.category AND sc.name = o.subcategory LIMIT 1) AS field_defs,
              lq.id AS last_quote_id, lq.price AS last_price, lq.duration AS last_duration,
              lq.duration_unit AS last_duration_unit, lq.stage AS last_stage,
              lq.document_url AS last_document_url, lq.created_at AS last_quoted_at
         FROM order_suppliers os
         JOIN orders o ON o.order_id = os.order_id
         LEFT JOIN LATERAL (
           SELECT * FROM supplier_quotations sq
            WHERE sq.order_id = os.order_id AND sq.supplier_id = os.supplier_id
            ORDER BY sq.created_at DESC LIMIT 1
         ) lq ON true
        WHERE os.supplier_id = $1
        ORDER BY os.sent_at DESC`,
      [supplier_id]
    );
    return res.json(rows);
  })
);

/**
 * GET /api/supplier/requirements/:orderId  (Supplier) — single requirement +
 * the supplier's full quotation history for that order.
 */
router.get(
  '/requirements/:orderId',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { supplier_id } = req.user;
    const link = await query(
      `SELECT os.*, o.requirement, o.note, o.quantity, o.price_range, o.pincode, o.status AS order_status
         FROM order_suppliers os JOIN orders o ON o.order_id = os.order_id
        WHERE os.order_id = $1 AND os.supplier_id = $2`,
      [req.params.orderId, supplier_id]
    );
    if (link.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });

    const quotes = await query(
      `SELECT * FROM supplier_quotations WHERE order_id = $1 AND supplier_id = $2 ORDER BY created_at DESC`,
      [req.params.orderId, supplier_id]
    );
    return res.json({ requirement: link.rows[0], quotations: quotes.rows });
  })
);

/**
 * GET /api/supplier/quotations  (Supplier) — all quotations this supplier has
 * submitted, with the order + category, for the History tab. Optional ?status=.
 */
router.get(
  '/quotations',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const params = [req.user.supplier_id];
    let where = 'sq.supplier_id = $1';
    if (req.query.status) { params.push(req.query.status); where += ` AND sq.status = $${params.length}`; }
    const { rows } = await query(
      `SELECT sq.id, sq.order_id, sq.price, sq.quantity, sq.duration, sq.duration_unit,
              sq.note, sq.message, sq.stage, sq.status, sq.document_url, sq.created_at,
              o.category, o.subcategory, o.requirement, o.status AS order_status
         FROM supplier_quotations sq JOIN orders o ON o.order_id = sq.order_id
        WHERE ${where} ORDER BY sq.created_at DESC LIMIT 300`,
      params
    );
    return res.json(rows);
  })
);

/**
 * GET /api/supplier/deliveries  (Supplier) — deliveries fulfilled by this
 * supplier (delivered orders history).
 */
router.get(
  '/deliveries',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT d.delivery_id, d.order_id, d.status, d.vehicle_number, d.delivery_location, d.created_at,
              o.category, o.subcategory
         FROM deliveries d LEFT JOIN orders o ON o.order_id = d.order_id
        WHERE d.supplier_id = $1 ORDER BY d.created_at DESC`,
      [req.user.supplier_id]
    );
    return res.json(rows);
  })
);

module.exports = router;
