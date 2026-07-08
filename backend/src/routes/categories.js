const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/categories  (any authenticated)
 * Full taxonomy: categories each with their sub-categories (incl. field defs).
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.name,
              COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name, 'fields', s.fields)
                       ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), '[]') AS subcategories
         FROM categories c LEFT JOIN subcategories s ON s.category_id = c.id
        GROUP BY c.id ORDER BY c.name`
    );
    return res.json(rows);
  })
);

/**
 * POST /api/categories  (Admin/Manager) — add a category.
 */
router.post(
  '/',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
      [name]
    );
    return res.status(201).json(rows[0]);
  })
);

/**
 * POST /api/categories/:id/subcategories  (Admin/Manager) — add a sub-category
 * (optionally with a `fields` array driving the supplier form).
 */
router.post(
  '/:id/subcategories',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const fields = Array.isArray(req.body.fields) ? JSON.stringify(req.body.fields) : '[]';
    const { rows } = await query(
      `INSERT INTO subcategories (category_id, name, fields) VALUES ($1, $2, $3)
       ON CONFLICT (category_id, name) DO UPDATE SET fields = EXCLUDED.fields RETURNING *`,
      [req.params.id, name, fields]
    );
    return res.status(201).json(rows[0]);
  })
);

/**
 * PATCH /api/categories/subcategories/:subId  (Admin/Manager) — set the fields
 * that a supplier fills for this sub-category.
 */
router.patch(
  '/subcategories/:subId',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    if (!Array.isArray(req.body.fields)) return res.status(400).json({ error: 'fields array required' });
    const { rows } = await query(
      `UPDATE subcategories SET fields = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(req.body.fields), req.params.subId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sub-category not found' });
    return res.json(rows[0]);
  })
);

/**
 * DELETE /api/categories/subcategories/:subId  (Admin/Manager)
 */
router.delete(
  '/subcategories/:subId',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM subcategories WHERE id = $1', [req.params.subId]);
    return res.json({ ok: true });
  })
);

module.exports = router;
