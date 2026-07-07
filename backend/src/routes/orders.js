const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextOrderId, nextProjectId, nextQuotationId } = require('../utils/idGenerator');

const router = express.Router();

const MAX_SUPPLIERS = 30;

/**
 * POST /api/orders  (Internal)
 * Create an order. Optionally auto-creates a project when only an enquiry is
 * given, so the "call customer -> project -> order" step is one action.
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { customer_id, enquiry_id, requirement, note, quantity, price_range, pincode } = req.body;
    let { project_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

    const order = await withTransaction(async (client) => {
      if (!project_id) {
        project_id = await nextProjectId(client);
        await client.query(
          `INSERT INTO projects (project_id, customer_id, enquiry_id, created_by)
           VALUES ($1, $2, $3, $4)`,
          [project_id, customer_id, enquiry_id || null, req.user.id]
        );
      }
      const orderId = await nextOrderId(client);
      const { rows } = await client.query(
        `INSERT INTO orders
           (order_id, project_id, customer_id, enquiry_id, requirement, note,
            quantity, price_range, pincode, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [orderId, project_id, customer_id, enquiry_id || null, requirement || null,
         note || null, quantity || null, price_range || null, pincode || null, req.user.id]
      );
      if (enquiry_id) {
        await client.query(
          `UPDATE enquiries SET status = 'in_discussion', project_id = $1, updated_at = now()
            WHERE enquiry_id = $2`,
          [project_id, enquiry_id]
        );
      }
      return rows[0];
    });
    return res.status(201).json(order);
  })
);

/**
 * GET /api/orders  (Internal: all; Customer: own)
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { role, customer_id } = req.user;
    const { status } = req.query;
    const clauses = [];
    const params = [];
    if (role === 'customer') {
      params.push(customer_id);
      clauses.push(`o.customer_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`o.status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT o.*, c.first_name, c.last_name, c.mobile_num,
              (SELECT count(*) FROM order_suppliers os WHERE os.order_id = o.order_id) AS suppliers_count,
              (SELECT count(*) FROM supplier_quotations sq WHERE sq.order_id = o.order_id) AS quotes_count
         FROM orders o JOIN customers c ON c.customer_id = o.customer_id
         ${where} ORDER BY o.created_at DESC LIMIT 200`,
      params
    );
    return res.json(rows);
  })
);

/**
 * GET /api/orders/:id
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, c.first_name, c.last_name, c.mobile_num, c.city AS customer_city
         FROM orders o JOIN customers c ON c.customer_id = o.customer_id
        WHERE o.order_id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'customer' && order.customer_id !== req.user.customer_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(order);
  })
);

/**
 * POST /api/orders/:id/send-suppliers  (Internal)
 * "Send the requirement to all suppliers at one click" — pick up to 30 suppliers
 * (typically filtered by pincode) and fan the requirement out to them.
 */
router.post(
  '/:id/send-suppliers',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { supplier_ids, requirement, note, quantity, price_range } = req.body;
    if (!Array.isArray(supplier_ids) || supplier_ids.length === 0) {
      return res.status(400).json({ error: 'supplier_ids must be a non-empty array' });
    }
    if (supplier_ids.length > MAX_SUPPLIERS) {
      return res.status(400).json({ error: `You can select at most ${MAX_SUPPLIERS} suppliers` });
    }

    const result = await withTransaction(async (client) => {
      const upd = await client.query(
        `UPDATE orders SET requirement = COALESCE($1, requirement), note = COALESCE($2, note),
                quantity = COALESCE($3, quantity), price_range = COALESCE($4, price_range),
                status = 'sent_to_suppliers', updated_at = now()
          WHERE order_id = $5 RETURNING *`,
        [requirement || null, note || null, quantity || null, price_range || null, req.params.id]
      );
      if (upd.rows.length === 0) {
        const e = new Error('Order not found');
        e.status = 404;
        throw e;
      }
      const order = upd.rows[0];

      let sent = 0;
      for (const supplierId of supplier_ids) {
        const ins = await client.query(
          `INSERT INTO order_suppliers (order_id, supplier_id, stage, status)
           VALUES ($1, $2, 'requirement', 'sent')
           ON CONFLICT (order_id, supplier_id) DO NOTHING`,
          [req.params.id, supplierId]
        );
        if (ins.rowCount > 0) {
          sent += 1;
          await client.query(
            `INSERT INTO notifications (supplier_id, type, title, body, data)
             VALUES ($1, 'order', $2, $3, $4)`,
            [supplierId, `New requirement · ${req.params.id}`,
             (requirement || order.requirement || '').slice(0, 120),
             JSON.stringify({ order_id: req.params.id })]
          );
        }
      }
      return { order, sent };
    });

    return res.json({ order: result.order, suppliers_sent: result.sent });
  })
);

/**
 * GET /api/orders/:id/suppliers  (Internal) — who the requirement went to.
 */
router.get(
  '/:id/suppliers',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT os.*, s.supplier_firm_name, s.contact_person_name, s.city, s.mobile
         FROM order_suppliers os JOIN suppliers s ON s.supplier_id = os.supplier_id
        WHERE os.order_id = $1 ORDER BY os.sent_at`,
      [req.params.id]
    );
    return res.json(rows);
  })
);

/**
 * GET /api/orders/:id/comparison  (Internal)
 * The "Comparison Sheet": every supplier response as sheet rows with the exact
 * columns requested (person, company, location, GST, phone, price, quantity,
 * duration, remark, mail, document).
 */
router.get(
  '/:id/comparison',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT sq.id, sq.supplier_id, sq.price, sq.quantity, sq.duration, sq.duration_unit,
              sq.note, sq.document_url, sq.stage, sq.status, sq.created_at,
              s.contact_person_name, s.supplier_firm_name, s.city AS location,
              s.current_gst_info AS gst, s.mobile AS phone, s.email AS mail
         FROM supplier_quotations sq
         JOIN suppliers s ON s.supplier_id = sq.supplier_id
        WHERE sq.order_id = $1
        ORDER BY sq.price NULLS LAST, sq.created_at`,
      [req.params.id]
    );
    return res.json({ order_id: req.params.id, rows });
  })
);

/**
 * POST /api/orders/:id/quote-customer  (Internal)
 * Take a supplier quote, add our GST/tax/margin, and send it to the customer
 * in one click (with a temporary/masked supplier id).
 */
router.post(
  '/:id/quote-customer',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const {
      based_on_supplier_quote, temp_supplier_id, base_amount, gst_percent,
      tax_amount, margin, total_amount, quantity, duration, note, document_url,
    } = req.body;

    const quote = await withTransaction(async (client) => {
      const ord = await client.query('SELECT customer_id FROM orders WHERE order_id = $1', [req.params.id]);
      if (ord.rows.length === 0) {
        const e = new Error('Order not found');
        e.status = 404;
        throw e;
      }
      const customerId = ord.rows[0].customer_id;
      const quotationId = await nextQuotationId(client);

      // total defaults to base + tax + margin when not explicitly provided
      const computedTotal = total_amount != null ? total_amount
        : (Number(base_amount || 0) + Number(tax_amount || 0) + Number(margin || 0));

      const { rows } = await client.query(
        `INSERT INTO customer_quotations
           (quotation_id, order_id, customer_id, based_on_supplier_quote, temp_supplier_id,
            base_amount, gst_percent, tax_amount, margin, total_amount, quantity, duration, note, document_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [quotationId, req.params.id, customerId, based_on_supplier_quote || null,
         temp_supplier_id || null, base_amount || null, gst_percent || null, tax_amount || null,
         margin || null, computedTotal, quantity || null, duration || null, note || null, document_url || null]
      );

      await client.query(
        `UPDATE orders SET status = 'quoted_to_customer', updated_at = now() WHERE order_id = $1`,
        [req.params.id]
      );
      if (based_on_supplier_quote) {
        await client.query(
          `UPDATE supplier_quotations SET status = 'finalized', updated_at = now() WHERE id = $1`,
          [based_on_supplier_quote]
        );
      }
      await client.query(
        `INSERT INTO notifications (customer_id, type, title, body, data)
         VALUES ($1, 'quotation', $2, $3, $4)`,
        [customerId, `Quotation ${quotationId} received`,
         `Total ₹${Number(computedTotal).toLocaleString('en-IN')}`,
         JSON.stringify({ quotation_id: quotationId, order_id: req.params.id })]
      );
      return rows[0];
    });
    return res.status(201).json(quote);
  })
);

/**
 * PATCH /api/orders/:id/status  (Internal)
 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const { rows } = await query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE order_id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
