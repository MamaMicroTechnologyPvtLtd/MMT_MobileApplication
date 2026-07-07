# MMT Backend (Node.js + Express + PostgreSQL)

Shared REST API for all three interfaces. The procurement workflow is linked by the **Order ID**,
and all business IDs **continue the legacy series** (see the root README for the rules).

## Setup

```bash
cp .env.example .env         # set DATABASE_URL and JWT_SECRET
npm install
npm run db:setup             # apply schema + seed id_counters at legacy values
npm run db:import-legacy     # import old customers & suppliers, advance counters
npm run db:seed-employees    # create seed employee logins (admin + manager)
npm run dev                  # http://localhost:4000
```

`db:seed-employees` creates two internal logins so you can get in on a fresh DB:

| Login (company email)             | Default password    |
|-----------------------------------|---------------------|
| `admin@mamamicrotechnology.com`   | `Admin@MMT2026`     |
| `manager@mamamicrotechnology.com` | `Manager@MMT2026`   |

Override before first run with `SEED_ADMIN_PASSWORD` / `SEED_MANAGER_PASSWORD`, and change the
passwords after logging in. The script is idempotent (existing accounts are skipped, never reset).

`db:import-legacy` reads `data/legacy/customer_db.sql` and `data/legacy/suplier_db.sql`
(the provided old-software dumps) and:
1. Imports customers/suppliers into the new Postgres tables (region fields left blank where the
   legacy data was NULL — they are meant to be filled in going forward).
2. Advances `id_counters` so the next generated id continues the series
   (verified: next customer = `C1823`, next supplier = `S101`, next order = `O5424`).

## ID generation

`src/utils/idGenerator.js` allocates ids by atomically incrementing a row in `id_counters`
(`UPDATE ... RETURNING`) inside the same transaction as the insert, so concurrent requests can
never collide or skip. Format is preserved from the old software (`MH_91_Z1_C####`, etc.).

## API surface

> **Auth model:** only internal **employees** self-register, and only with a **company official
> email** (domain configured via `EMPLOYEE_EMAIL_DOMAINS`, default `mamamicrotechnology.com`).
> Customers and suppliers do **not** self-register — an internal member creates their record and the
> system issues a login whose **username is the business ID** (`customer_id` / `supplier_id`) plus a
> generated password. They log in with that ID. The plaintext password is returned to the internal
> member **once** to hand over.

| Method & path                       | Role      | Purpose |
|-------------------------------------|-----------|---------|
| `POST /api/auth/register`           | public    | **Internal employees only** — requires a company email (`EMPLOYEE_EMAIL_DOMAINS`) + password |
| `POST /api/auth/login`              | public    | Login with `{ login, password }` — `login` is an email (internal) or an ID (customer/supplier) |
| `GET  /api/auth/me`                 | any       | Current user + linked profile |
| `GET  /api/dashboard`               | internal  | Aggregate stats (counts, revenue, stages) + recent activity |
| `GET/POST /api/customers/:id/account` | internal | Check / create-or-reset a customer login (returns credentials once) |
| `POST /api/enquiries`               | customer  | Send enquiry to Internal |
| `GET  /api/enquiries`               | customer/internal | Enquiry history / Internal enquiry list |
| `PATCH /api/enquiries/:id/status`   | internal  | Move enquiry through the workflow |
| `GET  /api/quotations`              | customer  | Quotations received from Internal |
| `POST /api/quotations/:id/respond`  | customer  | Confirm / reject a quotation |
| `GET  /api/deliveries`              | customer/internal | Delivery status history |
| `GET  /api/payments`                | customer/internal | Payments history |
| `POST /api/payments/:id/create-order` | customer | Start checkout (Razorpay order, or mock in dev) |
| `POST /api/payments/:id/verify`     | customer  | Verify Razorpay signature (or mock) → mark paid |
| `POST /api/payments/:id/pay`        | customer  | Record a manual/offline settlement |
| `GET  /api/notifications`           | any       | Notifications (incl. offers) |
| `POST /api/notifications/:id/read`  | any       | Mark read |
| `POST /api/notifications/register-token` | any  | Store the caller's Expo push token for device push |
| `GET/POST/PUT /api/customers`       | internal  | List by pincode / **Add** (issues login) / **Edit** existing |
| `GET/POST/PUT /api/suppliers`       | internal  | List by pincode / **Add** / **Edit** existing |
| `GET/POST /api/suppliers/:id/account` | internal | Check / create a supplier login (onboarding) |
| `POST /api/projects`                | internal  | Create project (continues numeric series) |
| `POST /api/orders`                  | internal  | Create order (auto-creates project if none) |
| `GET  /api/orders`                  | internal/customer | Orders feed (with supplier/quote counts) |
| `POST /api/orders/:id/send-suppliers` | internal | Send requirement to ≤30 suppliers (in-app + WhatsApp links / Cloud API) |
| `GET  /api/orders/:id/comparison`   | internal  | **Comparison Sheet** rows |
| `GET  /api/orders/:id/comparison.xlsx` | internal | Download the Comparison Sheet as a styled Excel workbook (`?token=`) |
| `GET  /api/orders/:id/comparison.csv` | internal | Same, as CSV (`?token=`) |
| `POST /api/orders/:id/quote-customer` | internal | Edit supplier quote (GST/tax/margin) → send to customer |
| `PATCH /api/supplier-quotations/:id` | internal | Shortlist / ask Final Quotation / ask Final PO |
| `GET  /api/supplier/requirements`   | supplier  | Requirements sent to me (+ my latest quote & stage) |
| `GET  /api/supplier/requirements/:orderId` | supplier | One requirement + my quotation history |
| `POST /api/orders/:orderId/quotations` | supplier | Reply to a requirement (feeds the Comparison Sheet) |
| `POST /api/uploads`                 | any       | Upload a quotation PDF / document → returns a served URL |
| `POST /api/deliveries`              | internal  | Create delivery (Delivery ID + docs + vehicle) |
| `PATCH /api/deliveries/:id/status`  | internal  | Update delivery status |
| `POST /api/payments`                | internal  | Raise advance / final payment request |

The Supplier reply flow (`POST /api/orders/:orderId/quotations`) already exists on the same schema
(`order_suppliers`, `supplier_quotations`); the Supplier **interface** (screens) is the next phase.

## Data model

See `src/db/schema.sql`. Core tables: `customers`, `suppliers`, `enquiries`, `projects`, `orders`,
`order_suppliers`, `supplier_quotations`, `customer_quotations`, `deliveries`, `payments`,
`notifications`, plus `users` (auth) and `id_counters`.
