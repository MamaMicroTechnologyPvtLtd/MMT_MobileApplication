const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { pushInternal } = require('../utils/notify');

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

/**
 * PATCH /api/supplier/requirements/:orderId/confirm  (Supplier)
 * The supplier accepts the final quotation / PO and confirms the order. Only
 * allowed once the Internal team has advanced this supplier to a final stage
 * (final_quotation or final_po). This is what actually confirms the order for
 * the supplier — the Internal team then creates the delivery with the
 * bill / invoice / e-way / PO documents.
 */
router.patch(
  '/requirements/:orderId/confirm',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { supplier_id } = req.user;
    const { orderId } = req.params;
    const link = await query(
      'SELECT stage, status FROM order_suppliers WHERE order_id = $1 AND supplier_id = $2',
      [orderId, supplier_id]
    );
    if (link.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });
    if (!['final_quotation', 'final_po'].includes(link.rows[0].stage)) {
      return res.status(400).json({ error: 'You can confirm only after the MMT team asks for your final quotation/PO.' });
    }

    const result = await withTransaction(async (client) => {
      await client.query(
        `UPDATE order_suppliers SET status = 'confirmed' WHERE order_id = $1 AND supplier_id = $2`,
        [orderId, supplier_id]
      );
      // Mark the supplier's most recent quotation on this order as confirmed.
      await client.query(
        `UPDATE supplier_quotations SET status = 'confirmed', updated_at = now()
          WHERE id = (SELECT id FROM supplier_quotations
                       WHERE order_id = $1 AND supplier_id = $2 ORDER BY created_at DESC LIMIT 1)`,
        [orderId, supplier_id]
      );
      await client.query(
        `UPDATE orders SET status = 'confirmed', updated_at = now() WHERE order_id = $1`,
        [orderId]
      );
      await client.query(
        `INSERT INTO notifications (type, title, body, data)
         VALUES ('order', $1, $2, $3)`,
        [`Order confirmed by ${supplier_id} · ${orderId}`,
         'The supplier accepted the final quotation. Create the delivery with the documents.',
         JSON.stringify({ order_id: orderId, supplier_id })]
      );
      return { order_id: orderId, supplier_id, status: 'confirmed' };
    });
    pushInternal({
      title: `Order confirmed · ${orderId}`,
      body: `${supplier_id} accepted the final quotation.`,
      data: { type: 'order', order_id: orderId, supplier_id },
    }).catch(() => {});
    return res.json(result);
  })
);

module.exports = router;
