const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextEnquiryId } = require('../utils/idGenerator');
const { pushInternal } = require('../utils/notify');

const router = express.Router();

/**
 * POST /api/enquiries  (Customer)
 * The customer's "input form to send the enquiry to Internal".
 */
router.post(
  '/',
  authenticate,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { customer_id } = req.user;
    if (!customer_id) return res.status(400).json({ error: 'No customer linked to this account' });

    const {
      subject, message, target_price, location, pincode,
      contact_phone, project_id,
    } = req.body;
    if (!message) return res.status(400).json({ error: 'message (requirement) is required' });

    // Items = the materials requested in this enquiry, each a category/subcategory
    // with its own quantity + unit. For backward compatibility we also accept a
    // single category/subcategory/quantity/unit and wrap it into one item, and we
    // mirror the FIRST item back into those columns so existing views keep working.
    const cleanItems = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((it) => ({
        category: (it.category || '').toString().trim() || null,
        subcategory: (it.subcategory || '').toString().trim() || null,
        quantity: (it.quantity || '').toString().trim() || null,
        unit: (it.unit || '').toString().trim() || null,
      }))
      .filter((it) => it.category || it.quantity || it.unit);
    if (cleanItems.length === 0 && (req.body.category || req.body.quantity)) {
      cleanItems.push({
        category: req.body.category || null,
        subcategory: req.body.subcategory || null,
        quantity: req.body.quantity || null,
        unit: req.body.unit || null,
      });
    }
    const first = cleanItems[0] || {};
    const category = first.category || null;
    const subcategory = first.subcategory || null;
    const quantity = first.quantity || null;
    const unit = first.unit || null;

    // If an existing project is chosen, it must belong to this customer.
    if (project_id) {
      const p = await query(
        'SELECT project_id FROM projects WHERE project_id = $1 AND customer_id = $2',
        [project_id, customer_id]
      );
      if (p.rows.length === 0) {
        return res.status(400).json({ error: 'Selected project not found for this customer' });
      }
    }

    const enquiry = await withTransaction(async (client) => {
      const enquiryId = await nextEnquiryId(client);
      const { rows } = await client.query(
        `INSERT INTO enquiries
           (enquiry_id, customer_id, category, subcategory, subject, message, quantity, unit, target_price,
            location, pincode, contact_phone, project_id, items, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [enquiryId, customer_id, category, subcategory, subject || null, message,
         quantity, unit, target_price || null, location || null, pincode || null,
         contact_phone || null, project_id || null, JSON.stringify(cleanItems),
         project_id ? 'in_discussion' : 'new']
      );
      // Notify internal team (broadcast row keyed to internal users at read time).
      await client.query(
        `INSERT INTO notifications (customer_id, type, title, body, data)
         VALUES ($1, 'order', $2, $3, $4)`,
        [customer_id, 'New enquiry received', `${subject || category || 'Enquiry'}: ${message.slice(0, 80)}`,
         JSON.stringify({ enquiry_id: enquiryId })]
      );
      return rows[0];
    });

    pushInternal({
      title: 'New enquiry received',
      body: `${enquiry.subject || enquiry.category || 'Enquiry'}: ${enquiry.message.slice(0, 80)}`,
      data: { type: 'order', enquiry_id: enquiry.enquiry_id },
    }).catch(() => {});
    return res.status(201).json(enquiry);
  })
);

/**
 * GET /api/enquiries  (Customer: own; Internal: all)
 * Supports the "send enquiry history" and the Internal "display of enquiries on top".
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
      clauses.push(`e.customer_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`e.status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT e.*, c.first_name, c.last_name, c.mobile_num, c.city, c.pincode AS customer_pincode
         FROM enquiries e
         JOIN customers c ON c.customer_id = e.customer_id
         ${where}
         ORDER BY e.created_at DESC`,
      params
    );
    return res.json(rows);
  })
);

/**
 * GET /api/enquiries/:id — single enquiry (owner customer or internal).
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM enquiries WHERE enquiry_id = $1', [req.params.id]);
    const enquiry = rows[0];
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (req.user.role === 'customer' && enquiry.customer_id !== req.user.customer_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(enquiry);
  })
);

/**
 * PATCH /api/enquiries/:id/status  (Internal)
 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['new', 'in_discussion', 'quoted', 'closed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid status' });
    const { rows } = await query(
      `UPDATE enquiries SET status = $1, updated_at = now() WHERE enquiry_id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Enquiry not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
