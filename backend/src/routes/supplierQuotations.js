const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/orders/:orderId/quotations  (Supplier)
 * A supplier replies to a requirement with a quotation. Feeds the Comparison
 * Sheet on the Internal side. (Mounted under /api/orders in app.js.)
 */
router.post(
  '/:orderId/quotations',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { supplier_id } = req.user;
    const { orderId } = req.params;
    const { price, quantity, duration, duration_unit, note, document_url, stage } = req.body;

    // The supplier must have been sent this requirement.
    const link = await query(
      'SELECT id FROM order_suppliers WHERE order_id = $1 AND supplier_id = $2',
      [orderId, supplier_id]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({ error: 'This requirement was not sent to you' });
    }

    const quote = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO supplier_quotations
           (order_id, supplier_id, price, quantity, duration, duration_unit, note, document_url, stage)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [orderId, supplier_id, price ?? null, quantity || null, duration || null,
         duration_unit || null, note || null, document_url || null, stage || 'quotation']
      );
      await client.query(
        `UPDATE order_suppliers SET status = 'responded' WHERE order_id = $1 AND supplier_id = $2`,
        [orderId, supplier_id]
      );
      await client.query(
        `UPDATE orders SET status = 'quotes_received', updated_at = now()
          WHERE order_id = $1 AND status IN ('sent_to_suppliers', 'created')`,
        [orderId]
      );
      await client.query(
        `INSERT INTO notifications (type, title, body, data)
         VALUES ('quotation', $1, $2, $3)`,
        [`Quotation received · ${orderId}`, `From ${supplier_id}`,
         JSON.stringify({ order_id: orderId, supplier_id })]
      );
      return rows[0];
    });
    return res.status(201).json(quote);
  })
);

/**
 * GET /api/orders/:orderId/my-quotations  (Supplier) — own submissions.
 */
router.get(
  '/:orderId/my-quotations',
  authenticate,
  requireRole('supplier'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM supplier_quotations WHERE order_id = $1 AND supplier_id = $2 ORDER BY created_at DESC`,
      [req.params.orderId, req.user.supplier_id]
    );
    return res.json(rows);
  })
);

module.exports = router;

// ---------------------------------------------------------------------------
// A second small router for acting on individual supplier quotations, mounted
// at /api/supplier-quotations.
// ---------------------------------------------------------------------------
const actionRouter = express.Router();

/**
 * PATCH /api/supplier-quotations/:id  (Internal)
 * Shortlist / finalize / reject a comparison-sheet row, and optionally ask the
 * supplier for the Final Quotation or Final PO (advances order_suppliers.stage).
 */
actionRouter.patch(
  '/:id',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { status, request_stage } = req.body; // status: shortlisted|finalized|rejected
    const updated = await withTransaction(async (client) => {
      const q = await client.query(
        `UPDATE supplier_quotations SET status = COALESCE($1, status), updated_at = now()
          WHERE id = $2 RETURNING *`,
        [status || null, req.params.id]
      );
      if (q.rows.length === 0) {
        const e = new Error('Quotation not found');
        e.status = 404;
        throw e;
      }
      const row = q.rows[0];
      if (request_stage) {
        // ask this supplier for the next document (final_quotation | final_po)
        await client.query(
          `UPDATE order_suppliers SET stage = $1, status = 'shortlisted'
            WHERE order_id = $2 AND supplier_id = $3`,
          [request_stage, row.order_id, row.supplier_id]
        );
        await client.query(
          `INSERT INTO notifications (supplier_id, type, title, body, data)
           VALUES ($1, 'order', $2, $3, $4)`,
          [row.supplier_id, `Please send ${request_stage.replace('_', ' ')} · ${row.order_id}`,
           'The MMT team shortlisted your quotation.',
           JSON.stringify({ order_id: row.order_id, stage: request_stage })]
        );
      }
      return row;
    });
    return res.json(updated);
  })
);

module.exports.actionRouter = actionRouter;
