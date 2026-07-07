const express = require('express');
const { query, withTransaction } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextDeliveryId } = require('../utils/idGenerator');
const { pushCustomer } = require('../utils/notify');

const router = express.Router();

/**
 * POST /api/deliveries  (Internal)
 * Created after advance payment. Generates a Delivery ID and attaches the
 * project/order documents (invoice, PO, bill, e-way) + vehicle details.
 */
router.post(
  '/',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const {
      order_id, project_id, customer_id, supplier_id, invoice_no, invoice_url,
      po_url, bill_url, eway_bill_url, truck_image_url, truck_video_url,
      vehicle_number, driver_name, driver_number,
      delivery_location, district, postal_code, status, remark,
    } = req.body;
    if (!order_id || !customer_id) {
      return res.status(400).json({ error: 'order_id and customer_id are required' });
    }

    const delivery = await withTransaction(async (client) => {
      const deliveryId = await nextDeliveryId(client);
      const { rows } = await client.query(
        `INSERT INTO deliveries
           (delivery_id, order_id, project_id, customer_id, supplier_id, invoice_no,
            invoice_url, po_url, bill_url, eway_bill_url, truck_image_url, truck_video_url,
            vehicle_number, driver_name, driver_number, delivery_location, district,
            postal_code, status, remark)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
        [deliveryId, order_id, project_id || null, customer_id, supplier_id || null,
         invoice_no || null, invoice_url || null, po_url || null, bill_url || null,
         eway_bill_url || null, truck_image_url || null, truck_video_url || null,
         vehicle_number || null, driver_name || null,
         driver_number || null, delivery_location || null, district || null,
         postal_code || null, status || 'pending', remark || null]
      );
      await client.query(
        `UPDATE orders SET status = 'in_delivery', updated_at = now() WHERE order_id = $1`,
        [order_id]
      );
      await client.query(
        `INSERT INTO notifications (customer_id, type, title, body, data)
         VALUES ($1, 'delivery', $2, $3, $4)`,
        [customer_id, `Delivery ${deliveryId} created`,
         vehicle_number ? `Vehicle ${vehicle_number}` : 'Your order is being prepared for delivery.',
         JSON.stringify({ delivery_id: deliveryId, order_id })]
      );
      return rows[0];
    });
    pushCustomer(customer_id, {
      title: `Delivery ${delivery.delivery_id} created`,
      body: vehicle_number ? `Vehicle ${vehicle_number}` : 'Your order is being prepared for delivery.',
      data: { type: 'delivery', delivery_id: delivery.delivery_id, order_id },
    }).catch(() => {});
    return res.status(201).json(delivery);
  })
);

/**
 * PATCH /api/deliveries/:id/status  (Internal) — update delivery status.
 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid status' });
    const { rows } = await query(
      `UPDATE deliveries SET status = $1, updated_at = now() WHERE delivery_id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Delivery not found' });
    await query(
      `INSERT INTO notifications (customer_id, type, title, body, data)
       VALUES ($1, 'delivery', $2, $3, $4)`,
      [rows[0].customer_id, `Delivery ${req.params.id}: ${status.replace('_', ' ')}`,
       null, JSON.stringify({ delivery_id: req.params.id })]
    );
    pushCustomer(rows[0].customer_id, {
      title: `Delivery ${req.params.id}`,
      body: `Status: ${status.replace('_', ' ')}`,
      data: { type: 'delivery', delivery_id: req.params.id },
    }).catch(() => {});
    return res.json(rows[0]);
  })
);

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
