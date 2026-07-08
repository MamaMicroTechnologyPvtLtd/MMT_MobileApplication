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
      onload_photo_url, onload_photo_at,
      vehicle_number, driver_name, driver_number,
      delivery_location, district, postal_code, status, remark,
    } = req.body;
    if (!order_id || !customer_id) {
      return res.status(400).json({ error: 'order_id and customer_id are required' });
    }
    // Stamp the on-load photo with the captured time (client-provided or now).
    const onloadAt = onload_photo_url ? (onload_photo_at || new Date().toISOString()) : null;

    const delivery = await withTransaction(async (client) => {
      const deliveryId = await nextDeliveryId(client);
      const { rows } = await client.query(
        `INSERT INTO deliveries
           (delivery_id, order_id, project_id, customer_id, supplier_id, invoice_no,
            invoice_url, po_url, bill_url, eway_bill_url, truck_image_url, truck_video_url,
            onload_photo_url, onload_photo_at,
            vehicle_number, driver_name, driver_number, delivery_location, district,
            postal_code, status, remark)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
        [deliveryId, order_id, project_id || null, customer_id, supplier_id || null,
         invoice_no || null, invoice_url || null, po_url || null, bill_url || null,
         eway_bill_url || null, truck_image_url || null, truck_video_url || null,
         onload_photo_url || null, onloadAt,
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
 * PATCH /api/deliveries/:id  (Internal)
 * Update delivery details: vehicle/driver, onsite photo (auto date/time stamp),
 * status, remark. When status becomes 'delivered' the order is completed and its
 * enquiry closed.
 */
router.patch(
  '/:id',
  authenticate,
  requireRole('internal'),
  asyncHandler(async (req, res) => {
    const editable = [
      'vehicle_number', 'driver_name', 'driver_number', 'delivery_location',
      'district', 'postal_code', 'remark', 'status',
      'invoice_no', 'invoice_url', 'po_url', 'bill_url', 'eway_bill_url',
      'truck_image_url', 'truck_video_url', 'onload_photo_url', 'onsite_photo_url',
    ];
    if (req.body.status) {
      const allowed = ['pending', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
      if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    let i = 1;
    for (const col of editable) {
      if (req.body[col] !== undefined) {
        sets.push(`${col} = $${i}`); params.push(req.body[col]); i += 1;
      }
    }
    // Stamp photo capture times when a new photo url is provided.
    if (req.body.onsite_photo_url !== undefined) {
      sets.push(`onsite_photo_at = $${i}`); params.push(req.body.onsite_photo_at || new Date().toISOString()); i += 1;
    }
    if (req.body.onload_photo_url !== undefined) {
      sets.push(`onload_photo_at = $${i}`); params.push(req.body.onload_photo_at || new Date().toISOString()); i += 1;
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = now()');
    params.push(req.params.id);

    const delivery = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE deliveries SET ${sets.join(', ')} WHERE delivery_id = $${params.length} RETURNING *`,
        params
      );
      if (rows.length === 0) { const e = new Error('Delivery not found'); e.status = 404; throw e; }
      const d = rows[0];

      // Closing: on delivered, complete the order and close its enquiry.
      if (req.body.status === 'delivered') {
        await client.query(`UPDATE orders SET status = 'completed', updated_at = now() WHERE order_id = $1`, [d.order_id]);
        await client.query(
          `UPDATE enquiries SET status = 'closed', updated_at = now()
            WHERE enquiry_id = (SELECT enquiry_id FROM orders WHERE order_id = $1)`,
          [d.order_id]
        );
      }
      if (req.body.status) {
        await client.query(
          `INSERT INTO notifications (customer_id, type, title, body, data)
           VALUES ($1, 'delivery', $2, $3, $4)`,
          [d.customer_id, `Delivery ${d.delivery_id}: ${req.body.status.replace('_', ' ')}`,
           null, JSON.stringify({ delivery_id: d.delivery_id })]
        );
      }
      return d;
    });

    if (req.body.status) {
      pushCustomer(delivery.customer_id, {
        title: `Delivery ${delivery.delivery_id}`,
        body: `Status: ${req.body.status.replace('_', ' ')}`,
        data: { type: 'delivery', delivery_id: delivery.delivery_id },
      }).catch(() => {});
    }
    return res.json(delivery);
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
