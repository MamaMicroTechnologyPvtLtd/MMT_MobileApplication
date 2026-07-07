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

    const { category, subject, message, quantity, unit, target_price, location, pincode } = req.body;
    if (!message) return res.status(400).json({ error: 'message (requirement) is required' });

    const enquiry = await withTransaction(async (client) => {
      const enquiryId = await nextEnquiryId(client);
      const { rows } = await client.query(
        `INSERT INTO enquiries
           (enquiry_id, customer_id, category, subject, message, quantity, unit, target_price, location, pincode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [enquiryId, customer_id, category || null, subject || null, message,
         quantity || null, unit || null, target_price || null, location || null, pincode || null]
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
