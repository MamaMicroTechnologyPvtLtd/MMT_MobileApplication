const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/deliveries  (Customer: own; Internal: all)
 * Order delivery status history.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { role, customer_id } = req.user;
    const params = [];
    let where = '';
    if (role === 'customer') {
      params.push(customer_id);
      where = 'WHERE d.customer_id = $1';
    }
    const { rows } = await query(
      `SELECT d.*, o.requirement
         FROM deliveries d
         LEFT JOIN orders o ON o.order_id = d.order_id
         ${where}
         ORDER BY d.created_at DESC`,
      params
    );
    return res.json(rows);
  })
);

/**
 * GET /api/deliveries/:id
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM deliveries WHERE delivery_id = $1', [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (req.user.role === 'customer' && delivery.customer_id !== req.user.customer_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(delivery);
  })
);

module.exports = router;
