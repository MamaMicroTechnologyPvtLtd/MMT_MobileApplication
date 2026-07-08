const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextProjectId } = require('../utils/idGenerator');

const router = express.Router();

/**
 * POST /api/projects  (Internal)
 * Created after the internal member calls the customer for discussion.
 * Continues the numeric project-id series.
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { customer_id, enquiry_id, ward } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

    const project = await withTransaction(async (client) => {
      const projectId = await nextProjectId(client);
      const { rows } = await client.query(
        `INSERT INTO projects (project_id, customer_id, enquiry_id, created_by, ward)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [projectId, customer_id, enquiry_id || null, req.user.id, ward || null]
      );
      if (enquiry_id) {
        await client.query(
          `UPDATE enquiries SET status = 'in_discussion', project_id = $1, updated_at = now()
            WHERE enquiry_id = $2`,
          [projectId, enquiry_id]
        );
      }
      return rows[0];
    });
    return res.status(201).json(project);
  })
);

/**
 * GET /api/projects/mine  (Customer)
 * The logged-in customer's existing projects (incl. those imported from the old
 * software), so they can raise an enquiry against an existing project.
 */
router.get(
  '/mine',
  authenticate,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT p.project_id, p.ward, p.created_at,
              (SELECT o.order_id FROM orders o WHERE o.project_id = p.project_id ORDER BY o.created_at LIMIT 1) AS order_id
         FROM projects p WHERE p.customer_id = $1 ORDER BY p.created_at DESC LIMIT 200`,
      [req.user.customer_id]
    );
    return res.json(rows);
  })
);

/**
 * GET /api/projects  (Internal)
 */
router.get(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { customer_id } = req.query;
    const params = [];
    let where = '';
    if (customer_id) {
      params.push(customer_id);
      where = 'WHERE p.customer_id = $1';
    }
    const { rows } = await query(
      `SELECT p.*, c.first_name, c.last_name
         FROM projects p JOIN customers c ON c.customer_id = p.customer_id
         ${where} ORDER BY p.created_at DESC LIMIT 200`,
      params
    );
    return res.json(rows);
  })
);

module.exports = router;
