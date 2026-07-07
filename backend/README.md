# MMT Backend (Node.js + Express + PostgreSQL)

Shared REST API for all three interfaces. The procurement workflow is linked by the **Order ID**,
and all business IDs **continue the legacy series** (see the root README for the rules).

## Setup

```bash
cp .env.example .env         # set DATABASE_URL and JWT_SECRET
npm install
npm run db:setup             # apply schema + seed id_counters at legacy values
npm run db:import-legacy     # import old customers & suppliers, advance counters
npm run dev                  # http://localhost:4000
```

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

| Method & path                       | Role      | Purpose |
|-------------------------------------|-----------|---------|
| `POST /api/auth/register`           | public    | Register; role=customer allocates next `C####` + customer record |
| `POST /api/auth/login`              | public    | Login, returns JWT |
| `GET  /api/auth/me`                 | any       | Current user + linked profile |
| `POST /api/enquiries`               | customer  | Send enquiry to Internal |
| `GET  /api/enquiries`               | customer/internal | Enquiry history / Internal enquiry list |
| `PATCH /api/enquiries/:id/status`   | internal  | Move enquiry through the workflow |
| `GET  /api/quotations`              | customer  | Quotations received from Internal |
| `POST /api/quotations/:id/respond`  | customer  | Confirm / reject a quotation |
| `GET  /api/deliveries`              | customer/internal | Delivery status history |
| `GET  /api/payments`                | customer/internal | Payments history |
| `POST /api/payments/:id/pay`        | customer  | Record advance/final payment |
| `GET  /api/notifications`           | any       | Notifications (incl. offers) |
| `POST /api/notifications/:id/read`  | any       | Mark read |
| `GET/POST/PUT /api/customers`       | internal  | List by pincode / **Add** / **Edit** existing |
| `GET/POST/PUT /api/suppliers`       | internal  | List by pincode / **Add** / **Edit** existing |

Routes for the Internal supplier fan-out (send requirement to ≤30 suppliers, comparison sheet) and
the Supplier reply flow build on the same schema (`order_suppliers`, `supplier_quotations`) and are
added with the Internal and Supplier interfaces.

## Data model

See `src/db/schema.sql`. Core tables: `customers`, `suppliers`, `enquiries`, `projects`, `orders`,
`order_suppliers`, `supplier_quotations`, `customer_quotations`, `deliveries`, `payments`,
`notifications`, plus `users` (auth) and `id_counters`.
