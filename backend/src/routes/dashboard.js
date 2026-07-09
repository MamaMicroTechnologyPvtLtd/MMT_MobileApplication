const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

// Turn rows of { key, count } into an object, always including the given keys.
function tally(rows, keys) {
  const out = {};
  keys.forEach((k) => { out[k] = 0; });
  let total = 0;
  for (const r of rows) {
    const n = Number(r.count);
    out[r.key] = n;
    total += n;
  }
  out.total = total;
  return out;
}

/**
 * GET /api/dashboard  (Internal)
 * Aggregate stats + recent activity for the internal home dashboard.
 */
router.get(
  '/',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const [
      customers, suppliers, listingEngineers, enquiryRows, orderRows, deliveryRows,
      supplierQuotes, customerQuotes, revenue, payments,
      recentEnquiries, recentOrders, recentListings,
    ] = await Promise.all([
      query('SELECT count(*)::int AS n FROM customers'),
      query('SELECT count(*)::int AS n FROM suppliers'),
      query("SELECT count(*)::int AS n FROM users WHERE role = 'internal' AND staff_role = 'listing_engineer'"),
      query('SELECT status AS key, count(*)::int AS count FROM enquiries GROUP BY status'),
      query('SELECT status AS key, count(*)::int AS count FROM orders GROUP BY status'),
      query('SELECT status AS key, count(*)::int AS count FROM deliveries GROUP BY status'),
      query("SELECT status AS key, count(*)::int AS count FROM supplier_quotations GROUP BY status"),
      query('SELECT status AS key, count(*)::int AS count FROM customer_quotations GROUP BY status'),
      query(`SELECT
                COALESCE(SUM(total_amount),0)::float AS quoted_total,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'confirmed'),0)::float AS confirmed_total,
                COALESCE(SUM(margin) FILTER (WHERE status = 'confirmed'),0)::float AS margin_total
              FROM customer_quotations`),
      query("SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'),0)::float AS paid FROM payments"),
      query(`SELECT e.enquiry_id, e.subject, e.category, e.status, e.created_at,
                    c.first_name, c.last_name
               FROM enquiries e JOIN customers c ON c.customer_id = e.customer_id
              ORDER BY e.created_at DESC LIMIT 5`),
      query(`SELECT o.order_id, o.status, o.requirement, o.created_at,
                    (SELECT count(*)::int FROM supplier_quotations sq WHERE sq.order_id = o.order_id) AS quotes
               FROM orders o ORDER BY o.created_at DESC LIMIT 5`),
      query(`SELECT l.id, l.project_name, l.customer_name, l.phone, l.location, l.pincode,
                    l.category, l.quantity, l.budget, l.materials, l.status, l.listing_date, l.created_at,
                    u.full_name AS engineer_full_name
               FROM listings l JOIN users u ON u.id = l.engineer_id
              ORDER BY l.created_at DESC LIMIT 8`),
    ]);

    return res.json({
      customers: customers.rows[0].n,
      suppliers: suppliers.rows[0].n,
      listing_engineers: listingEngineers.rows[0].n,
      enquiries: tally(enquiryRows.rows, ['new', 'in_discussion', 'quoted', 'closed']),
      orders: tally(orderRows.rows, [
        'created', 'sent_to_suppliers', 'quotes_received', 'shortlisted', 'finalized',
        'quoted_to_customer', 'confirmed', 'in_delivery', 'completed', 'cancelled',
      ]),
      deliveries: tally(deliveryRows.rows, ['pending', 'dispatched', 'in_transit', 'delivered', 'cancelled']),
      supplier_quotations: tally(supplierQuotes.rows, ['received', 'shortlisted', 'finalized', 'rejected']),
      customer_quotations: tally(customerQuotes.rows, ['sent', 'confirmed', 'rejected']),
      revenue: {
        quoted_total: revenue.rows[0].quoted_total,
        confirmed_total: revenue.rows[0].confirmed_total,
        margin_total: revenue.rows[0].margin_total,
        payments_paid: payments.rows[0].paid,
      },
      recent_enquiries: recentEnquiries.rows,
      recent_orders: recentOrders.rows,
      recent_listings: recentListings.rows,
    });
  })
);

module.exports = router;
