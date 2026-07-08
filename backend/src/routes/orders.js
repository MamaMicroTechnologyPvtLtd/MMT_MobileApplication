const express = require('express');
const ExcelJS = require('exceljs');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authenticateFlexible, requireRole } = require('../middleware/auth');
const { nextOrderId, nextProjectId, nextQuotationId } = require('../utils/idGenerator');
const { pushCustomer, pushSupplier } = require('../utils/notify');
const wa = require('../utils/whatsapp');

const router = express.Router();

const MAX_SUPPLIERS = 30;

// Quote a value for CSV (wrap in quotes, escape embedded quotes).
const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

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
    const {
      customer_id, enquiry_id, requirement, note, quantity, price_range, pincode,
      category, subcategory,
    } = req.body;
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
      // Inherit category/subcategory from the enquiry when not explicitly given.
      let cat = category;
      let subcat = subcategory;
      if ((!cat || !subcat) && enquiry_id) {
        const e = await client.query('SELECT category, subcategory FROM enquiries WHERE enquiry_id = $1', [enquiry_id]);
        if (e.rows[0]) { cat = cat || e.rows[0].category; subcat = subcat || e.rows[0].subcategory; }
      }
      const { rows } = await client.query(
        `INSERT INTO orders
           (order_id, project_id, customer_id, enquiry_id, category, subcategory, requirement, note,
            quantity, price_range, pincode, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [orderId, project_id, customer_id, enquiry_id || null, cat || null, subcat || null,
         requirement || null, note || null, quantity || null, price_range || null, pincode || null, req.user.id]
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

    // Best-effort device push to each supplier the requirement went to.
    for (const supplierId of supplier_ids) {
      pushSupplier(supplierId, {
        title: `New requirement · ${req.params.id}`,
        body: (requirement || result.order.requirement || 'You have a new requirement').slice(0, 120),
        data: { type: 'order', order_id: req.params.id },
      }).catch(() => {});
    }

    // WhatsApp: build a pre-filled message + wa.me deep link per supplier, and
    // (if the Cloud API is configured) send server-side for true one-click.
    const message = wa.requirementMessage({
      orderId: req.params.id,
      requirement: requirement || result.order.requirement,
      quantity: quantity || result.order.quantity,
      priceRange: price_range || result.order.price_range,
      note: note || result.order.note,
    });
    const supRows = await query(
      `SELECT supplier_id, supplier_firm_name, mobile FROM suppliers WHERE supplier_id = ANY($1)`,
      [supplier_ids]
    );
    const cloud = wa.cloudConfigured();
    const whatsapp = await Promise.all(supRows.rows.map(async (s) => {
      const entry = {
        supplier_id: s.supplier_id,
        firm_name: s.supplier_firm_name,
        phone: s.mobile,
        wa_link: wa.buildWaLink(s.mobile, message),
        sent: false,
      };
      if (cloud && s.mobile) {
        try { await wa.sendCloud(s.mobile, message); entry.sent = true; } catch { entry.sent = false; }
      }
      return entry;
    }));

    return res.json({
      order: result.order,
      suppliers_sent: result.sent,
      whatsapp_mode: cloud ? 'cloud_api' : 'deep_link',
      whatsapp,
    });
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
 * GET /api/orders/:id/comparison.csv  (Internal)
 * Download the Comparison Sheet as a CSV (opens in Excel). Auth via header or
 * ?token= so it can be opened directly / shared as a file.
 */
router.get(
  '/:id/comparison.csv',
  authenticateFlexible,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT sq.supplier_id, sq.price, sq.quantity, sq.duration, sq.duration_unit,
              sq.note, sq.document_url, sq.stage, sq.status,
              s.contact_person_name, s.supplier_firm_name, s.city AS location,
              s.current_gst_info AS gst, s.mobile AS phone, s.email AS mail
         FROM supplier_quotations sq
         JOIN suppliers s ON s.supplier_id = sq.supplier_id
        WHERE sq.order_id = $1
        ORDER BY sq.price NULLS LAST, sq.created_at`,
      [req.params.id]
    );

    const headers = ['Supplier Person', 'Supplier Company', 'Location', 'GST', 'Phone',
      'Price', 'Quantity', 'Duration', 'Remark/Note', 'Mail ID', 'Documentation',
      'Stage', 'Status', 'Supplier ID'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.contact_person_name, r.supplier_firm_name, r.location, r.gst, r.phone,
        r.price, r.quantity, [r.duration, r.duration_unit].filter(Boolean).join(' '),
        r.note, r.mail, r.document_url, r.stage, r.status, r.supplier_id,
      ].map(csvCell).join(','));
    }
    const csv = `﻿${lines.join('\r\n')}`; // BOM so Excel reads UTF-8

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ComparisonSheet_${req.params.id}.csv"`);
    return res.send(csv);
  })
);

// Columns for the Comparison Sheet (label + width), matching the spec order.
const COMPARISON_COLUMNS = [
  { header: 'Supplier Person', key: 'contact_person_name', width: 20 },
  { header: 'Supplier Company', key: 'supplier_firm_name', width: 26 },
  { header: 'Location', key: 'location', width: 18 },
  { header: 'GST', key: 'gst', width: 20 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Quantity', key: 'quantity', width: 14 },
  { header: 'Duration', key: 'duration', width: 14 },
  { header: 'Remark/Note', key: 'note', width: 28 },
  { header: 'Mail ID', key: 'mail', width: 24 },
  { header: 'Documentation', key: 'document_url', width: 30 },
  { header: 'Stage', key: 'stage', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Supplier ID', key: 'supplier_id', width: 18 },
];

/**
 * GET /api/orders/:id/comparison.xlsx  (Internal)
 * Download the Comparison Sheet as a styled Excel (.xlsx) workbook.
 */
router.get(
  '/:id/comparison.xlsx',
  authenticateFlexible,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT sq.supplier_id, sq.price, sq.quantity, sq.duration, sq.duration_unit,
              sq.note, sq.document_url, sq.stage, sq.status,
              s.contact_person_name, s.supplier_firm_name, s.city AS location,
              s.current_gst_info AS gst, s.mobile AS phone, s.email AS mail
         FROM supplier_quotations sq
         JOIN suppliers s ON s.supplier_id = sq.supplier_id
        WHERE sq.order_id = $1
        ORDER BY sq.price NULLS LAST, sq.created_at`,
      [req.params.id]
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMT';
    wb.created = new Date();
    const ws = wb.addWorksheet('Comparison Sheet', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    const lastCol = String.fromCharCode(64 + COMPARISON_COLUMNS.length); // e.g. 'N'
    ws.mergeCells(`A1:${lastCol}1`);
    const title = ws.getCell('A1');
    title.value = `Comparison Sheet — Order ${req.params.id}`;
    title.font = { bold: true, size: 14, color: { argb: 'FF0F766E' } };
    ws.addRow([]);

    ws.columns = COMPARISON_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    const headerRow = ws.addRow(COMPARISON_COLUMNS.map((c) => c.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF0F766E' } } };
    });

    for (const r of rows) {
      ws.addRow({
        ...r,
        price: r.price != null ? Number(r.price) : null,
        duration: [r.duration, r.duration_unit].filter(Boolean).join(' '),
      });
    }
    ws.getColumn('price').numFmt = '#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ComparisonSheet_${req.params.id}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
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
    pushCustomer(quote.customer_id, {
      title: `Quotation ${quote.quotation_id} received`,
      body: `Total ₹${Number(quote.total_amount || 0).toLocaleString('en-IN')}`,
      data: { type: 'quotation', quotation_id: quote.quotation_id, order_id: req.params.id },
    }).catch(() => {});
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
