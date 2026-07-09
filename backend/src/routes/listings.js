const express = require('express');
const ExcelJS = require('exceljs');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authenticateFlexible, requireStaff } = require('../middleware/auth');
const { pushInternal, pushUser } = require('../utils/notify');

const router = express.Router();

const isManager = (req) => ['admin', 'manager'].includes(req.user.staff_role);
const EDITABLE = ['project_name', 'customer_name', 'phone', 'location', 'pincode',
  'category', 'requirement', 'quantity', 'budget', 'status', 'remark'];

/**
 * POST /api/listings  (Listing Engineer / any internal)
 * Record a project listing. Tied to the logged-in engineer and today's date
 * (or a given listing_date).
 */
router.post(
  '/',
  authenticate,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!b.project_name && !b.customer_name && !b.phone) {
      return res.status(400).json({ error: 'Enter at least a project name, customer, or phone' });
    }
    const { rows } = await query(
      `INSERT INTO listings
        (engineer_id, engineer_name, project_name, customer_name, phone, location,
         pincode, category, requirement, quantity, budget, status, remark, listing_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, CURRENT_DATE))
       RETURNING *`,
      [req.user.id, req.body.engineer_name || null, b.project_name || null, b.customer_name || null,
       b.phone || null, b.location || null, b.pincode || null, b.category || null,
       b.requirement || null, b.quantity || null, b.budget || null,
       b.status || 'follow_up', b.remark || null, b.listing_date || null]
    );
    return res.status(201).json(rows[0]);
  })
);

/**
 * GET /api/listings  — Listing Engineer: own; Admin/Manager: all.
 * Filters: ?date=YYYY-MM-DD, ?engineer_id=, ?status=
 */
router.get(
  '/',
  authenticate,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const clauses = [];
    const params = [];
    if (!isManager(req)) {
      params.push(req.user.id);
      clauses.push(`l.engineer_id = $${params.length}`);
    } else if (req.query.engineer_id) {
      params.push(Number(req.query.engineer_id));
      clauses.push(`l.engineer_id = $${params.length}`);
    }
    if (req.query.date) {
      params.push(req.query.date);
      clauses.push(`l.listing_date = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      clauses.push(`l.status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT l.*, u.full_name AS engineer_full_name, u.email AS engineer_email
         FROM listings l JOIN users u ON u.id = l.engineer_id
         ${where} ORDER BY l.listing_date DESC, l.created_at DESC LIMIT 500`,
      params
    );
    return res.json(rows);
  })
);

/**
 * GET /api/listings/engineers  (Admin/Manager) — list of listing engineers,
 * with today's listing counts, for filtering + oversight.
 */
router.get(
  '/engineers',
  authenticate,
  requireStaff('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email,
              count(l.id) FILTER (WHERE l.listing_date = CURRENT_DATE) AS today_count,
              count(l.id) AS total_count
         FROM users u LEFT JOIN listings l ON l.engineer_id = u.id
        WHERE u.role = 'internal' AND u.staff_role = 'listing_engineer'
        GROUP BY u.id ORDER BY u.full_name NULLS LAST`
    );
    return res.json(rows);
  })
);

/**
 * GET /api/listings/day-report  — counts for an engineer on a date.
 * Engineer: own (?date). Admin/Manager: any (?engineer_id&date).
 */
router.get(
  '/day-report',
  authenticate,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const engineerId = isManager(req) && req.query.engineer_id
      ? Number(req.query.engineer_id) : req.user.id;
    const { rows } = await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'positive')::int AS positive,
              count(*) FILTER (WHERE status = 'negative')::int AS negative,
              count(*) FILTER (WHERE status = 'follow_up')::int AS follow_up
         FROM listings WHERE engineer_id = $1 AND listing_date = $2`,
      [engineerId, date]
    );
    return res.json({ engineer_id: engineerId, date, ...rows[0] });
  })
);

/**
 * POST /api/listings/day-report  (Listing Engineer) — generate/submit the day
 * report; stores it and notifies Admin/Manager.
 */
router.post(
  '/day-report',
  authenticate,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const counts = await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'positive')::int AS positive,
              count(*) FILTER (WHERE status = 'negative')::int AS negative,
              count(*) FILTER (WHERE status = 'follow_up')::int AS follow_up
         FROM listings WHERE engineer_id = $1 AND listing_date = $2`,
      [req.user.id, date]
    );
    const c = counts.rows[0];
    const name = (await query('SELECT full_name, email FROM users WHERE id = $1', [req.user.id])).rows[0];
    const { rows } = await query(
      `INSERT INTO day_reports (engineer_id, engineer_name, report_date, total, positive, negative, follow_up, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (engineer_id, report_date)
       DO UPDATE SET total = EXCLUDED.total, positive = EXCLUDED.positive,
                     negative = EXCLUDED.negative, follow_up = EXCLUDED.follow_up,
                     generated_at = now()
       RETURNING *`,
      [req.user.id, name?.full_name || name?.email || null, date, c.total, c.positive, c.negative, c.follow_up]
    );
    pushInternal({
      title: 'Listing day report submitted',
      body: `${name?.full_name || name?.email}: ${c.total} listings (${c.positive} positive) on ${date}`,
      data: { type: 'general', engineer_id: req.user.id, date },
    }).catch(() => {});
    return res.status(201).json(rows[0]);
  })
);

/**
 * GET /api/listings/export.xlsx  — the daily Excel sheet.
 * Engineer: own; Admin/Manager: any (?engineer_id). ?date filters the day.
 * Auth via header or ?token= for file download.
 */
router.get(
  '/export.xlsx',
  authenticateFlexible,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const manager = isManager(req);
    const engineerId = manager && req.query.engineer_id ? Number(req.query.engineer_id) : req.user.id;
    const clauses = ['l.engineer_id = $1'];
    const params = [engineerId];
    if (req.query.date) { params.push(req.query.date); clauses.push(`l.listing_date = $${params.length}`); }

    const { rows } = await query(
      `SELECT l.*, u.full_name AS engineer_full_name FROM listings l
         JOIN users u ON u.id = l.engineer_id
        WHERE ${clauses.join(' AND ')} ORDER BY l.listing_date, l.created_at`,
      params
    );

    const cols = [
      { header: '#', key: 'n', width: 5 },
      { header: 'Date', key: 'listing_date', width: 12 },
      { header: 'Project', key: 'project_name', width: 24 },
      { header: 'Customer', key: 'customer_name', width: 20 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Pincode', key: 'pincode', width: 10 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Requirement', key: 'requirement', width: 28 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Budget', key: 'budget', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remark', key: 'remark', width: 24 },
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Listings', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.mergeCells('A1', 'M1');
    ws.getCell('A1').value = `Listings — ${rows[0]?.engineer_full_name || 'Engineer'}${req.query.date ? ` · ${req.query.date}` : ''}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F766E' } };
    ws.addRow([]);
    ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
    const head = ws.addRow(cols.map((c) => c.header));
    head.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { horizontal: 'center' };
    });
    rows.forEach((r, idx) => ws.addRow({ ...r, n: idx + 1, listing_date: r.listing_date }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Listings_${engineerId}${req.query.date ? `_${req.query.date}` : ''}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  })
);

/**
 * PATCH /api/listings/:id — engineer edits own; Admin/Manager edit any
 * (incl. marking status positive/negative).
 */
router.patch(
  '/:id',
  authenticate,
  requireStaff(),
  asyncHandler(async (req, res) => {
    const existing = await query('SELECT engineer_id, project_name FROM listings WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    const ownerId = existing.rows[0].engineer_id;
    if (!isManager(req) && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own listings' });
    }
    if (req.body.status && !['positive', 'negative', 'follow_up'].includes(req.body.status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    let i = 1;
    for (const col of EDITABLE) {
      if (req.body[col] !== undefined) { sets.push(`${col} = $${i}`); params.push(req.body[col]); i += 1; }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = now()');
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    // If a manager/admin edited someone else's listing, alert that engineer so
    // it shows in their History → Alerts.
    if (isManager(req) && ownerId !== req.user.id) {
      const label = rows[0].project_name || existing.rows[0].project_name || 'A listing';
      const statusNote = req.body.status ? ` — status set to "${req.body.status}"` : '';
      const title = 'Your listing was updated by the team';
      const body = `${label}${statusNote}`;
      await query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'general', $2, $3)`,
        [ownerId, title, body]
      ).catch(() => {});
      pushUser(ownerId, { title, body, data: { type: 'general', listing_id: rows[0].id } }).catch(() => {});
    }

    return res.json(rows[0]);
  })
);

module.exports = router;
