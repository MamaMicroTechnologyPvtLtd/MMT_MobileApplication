const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { pushInternal, pushSupplier } = require('../utils/notify');

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
    const { price, quantity, duration, duration_unit, note, document_url, stage, details, message } = req.body;

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
           (order_id, supplier_id, price, quantity, duration, duration_unit, note, document_url, stage, details, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [orderId, supplier_id, price ?? null, quantity || null, duration || null,
         duration_unit || null, note || null, document_url || null, stage || 'quotation',
         details ? JSON.stringify(details) : '{}', message || null]
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
    pushInternal({
      title: `Quotation received · ${orderId}`,
      body: `From ${supplier_id}${price != null ? ` · ₹${price}` : ''}`,
      data: { type: 'quotation', order_id: orderId, supplier_id },
    }).catch(() => {});
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
    // status: shortlisted | finalized | rejected | deferred ("get back later")
    // request_stage: final_quotation | final_po  (+ optional po_url = our PO)
    const { status, request_stage, po_url } = req.body;
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
      // Plain shortlist (no document request): tell the supplier they are
      // shortlisted — this is NOT an order confirmation and creates no delivery.
      if (status === 'shortlisted' && !request_stage) {
        await client.query(
          `UPDATE order_suppliers SET status = 'shortlisted'
            WHERE order_id = $1 AND supplier_id = $2`,
          [row.order_id, row.supplier_id]
        );
        await client.query(
          `INSERT INTO notifications (supplier_id, type, title, body, data)
           VALUES ($1, 'general', $2, $3, $4)`,
          [row.supplier_id, `Shortlisted · ${row.order_id}`,
           'Your quotation has been shortlisted (not yet confirmed). We may ask for a final quotation next.',
           JSON.stringify({ order_id: row.order_id, shortlisted: true })]
        );
      }
      if (request_stage) {
        // ask this supplier for the next document, attaching our PO if provided
        await client.query(
          `UPDATE order_suppliers SET stage = $1, status = 'shortlisted', po_url = COALESCE($4, po_url)
            WHERE order_id = $2 AND supplier_id = $3`,
          [request_stage, row.order_id, row.supplier_id, po_url || null]
        );
        await client.query(
          `INSERT INTO notifications (supplier_id, type, title, body, data)
           VALUES ($1, 'order', $2, $3, $4)`,
          [row.supplier_id, `Please send ${request_stage.replace('_', ' ')} · ${row.order_id}`,
           po_url ? 'The MMT team attached a PO — please send your final quotation.'
             : 'The MMT team shortlisted your quotation.',
           JSON.stringify({ order_id: row.order_id, stage: request_stage, po_url: po_url || null })]
        );
      }
      return row;
    });
    if (request_stage) {
      pushSupplier(updated.supplier_id, {
        title: `Please send ${request_stage.replace('_', ' ')} · ${updated.order_id}`,
        body: po_url ? 'A PO has been attached.' : 'The MMT team shortlisted your quotation.',
        data: { type: 'order', order_id: updated.order_id, stage: request_stage },
      }).catch(() => {});
    } else if (status === 'shortlisted') {
      pushSupplier(updated.supplier_id, {
        title: `Shortlisted · ${updated.order_id}`,
        body: 'Your quotation has been shortlisted (not yet confirmed).',
        data: { type: 'general', order_id: updated.order_id },
      }).catch(() => {});
    }
    return res.json(updated);
  })
);

module.exports.actionRouter = actionRouter;
