const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notifications
 * Customer: notifications addressed to them (incl. offers).
 * Internal: broadcast + user notifications.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id, role, customer_id, supplier_id } = req.user;
    let where;
    let params;
    if (role === 'customer') {
      where = '(customer_id = $1 OR user_id = $2)';
      params = [customer_id, id];
    } else if (role === 'supplier') {
      where = '(supplier_id = $1 OR user_id = $2)';
      params = [supplier_id, id];
    } else if (req.user.staff_role === 'listing_engineer') {
      // listing engineers only see notifications addressed to them
      where = 'user_id = $1';
      params = [id];
    } else {
      // admin/manager see company-wide + personal
      where = "(user_id = $1 OR (customer_id IS NULL AND supplier_id IS NULL) OR type = 'order')";
      params = [id];
    }
    const { rows } = await query(
      `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return res.json(rows);
  })
);

/**
 * POST /api/notifications/register-token
 * Store the caller's Expo push token so they receive device notifications.
 */
router.post(
  '/register-token',
  authenticate,
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    await query('UPDATE users SET push_token = $1, updated_at = now() WHERE id = $2', [token, req.user.id]);
    return res.json({ ok: true });
  })
);

/**
 * POST /api/notifications/:id/read
 */
router.post(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    return res.json(rows[0]);
  })
);

module.exports = router;
