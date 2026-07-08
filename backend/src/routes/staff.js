const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/staff  (Admin/Manager) — internal employees + their staff role.
 */
router.get(
  '/',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, email, full_name, staff_role, created_at
         FROM users WHERE role = 'internal' ORDER BY created_at`
    );
    return res.json(rows);
  })
);

/**
 * PATCH /api/staff/:id/role  (Admin) — set an employee's staff role.
 */
router.patch(
  '/:id/role',
  authenticate,
  requireStaff('admin'),
  asyncHandler(async (req, res) => {
    const { staff_role } = req.body;
    if (!['admin', 'manager', 'listing_engineer'].includes(staff_role)) {
      return res.status(400).json({ error: 'invalid staff_role' });
    }
    const { rows } = await query(
      `UPDATE users SET staff_role = $1, updated_at = now()
        WHERE id = $2 AND role = 'internal'
        RETURNING id, email, full_name, staff_role`,
      [staff_role, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
