const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireStaff } = require('../middleware/auth');
const { generatePassword } = require('../utils/password');

const router = express.Router();

const EMPLOYEE_DOMAINS = (process.env.EMPLOYEE_EMAIL_DOMAINS || 'mamamicrotechnology.com')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const isCompanyEmail = (email) => {
  const at = String(email).lastIndexOf('@');
  return at >= 0 && EMPLOYEE_DOMAINS.includes(email.slice(at + 1).toLowerCase());
};

/**
 * POST /api/staff  (Admin/Manager)
 * Create an employee login and issue credentials. Managers can create Listing
 * Engineers; only an Admin can create Admin/Manager accounts. Requires a company
 * email. Returns the password once to hand over.
 */
router.post(
  '/',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim();
    const { full_name } = req.body;
    const staff_role = req.body.staff_role || 'listing_engineer';
    const password = req.body.password || generatePassword();

    if (!email) return res.status(400).json({ error: 'email is required' });
    if (!['admin', 'manager', 'listing_engineer'].includes(staff_role)) {
      return res.status(400).json({ error: 'invalid staff_role' });
    }
    if (['admin', 'manager'].includes(staff_role) && req.user.staff_role !== 'admin') {
      return res.status(403).json({ error: 'Only an Admin can create Admin/Manager accounts' });
    }
    if (!isCompanyEmail(email)) {
      return res.status(400).json({ error: `Use a company email (@${EMPLOYEE_DOMAINS[0]})` });
    }
    const taken = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (taken.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (role, email, password_hash, full_name, staff_role)
       VALUES ('internal', $1, $2, $3, $4)
       RETURNING id, email, full_name, staff_role`,
      [email, password_hash, full_name || null, staff_role]
    );
    return res.status(201).json({ user: rows[0], credentials: { username: email, password } });
  })
);

/**
 * POST /api/staff/:id/reset-password  (Admin/Manager) — issue a new password.
 */
router.post(
  '/:id/reset-password',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const target = await query("SELECT email, staff_role FROM users WHERE id = $1 AND role = 'internal'", [req.params.id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    if (['admin', 'manager'].includes(target.rows[0].staff_role) && req.user.staff_role !== 'admin') {
      return res.status(403).json({ error: 'Only an Admin can reset an Admin/Manager password' });
    }
    const password = req.body.password || generatePassword();
    const password_hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [password_hash, req.params.id]);
    return res.json({ credentials: { username: target.rows[0].email, password } });
  })
);

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
