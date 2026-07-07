# MMT Mobile Application

A three-interface procurement platform for **Mama Micro Technology (MAMA Home)**, rebuilding
and extending the legacy software while **continuing the existing Customer / Supplier / Project /
Order ID series** from the old database.

- **Mobile app:** React Native (Expo) — three role-based interfaces.
- **Backend:** Node.js (Express) + PostgreSQL REST API.
- **Messaging:** In-app (push/notification). WhatsApp bulk-send is planned for a later phase.

**Status:** all three interfaces are built and interlinked end-to-end — Customer (send enquiry →
receive quotation → confirm → history), Internal / MAM Home (enquiries → project/order → send to
≤30 suppliers → Comparison Sheet → quote customer → delivery), and Supplier (receive requirement →
reply with quotation PDF/duration/note → Final PO). On login each user is routed to their role's
interface.

```
MMT_MobileApplication/
├── backend/          Node.js + Express + PostgreSQL API (shared by all 3 interfaces)
├── mobile/           React Native (Expo) app — Customer interface built first
└── README.md         (this file)
```

## The three interfaces & the workflow

The whole system is stitched together by the **Order ID**. The end-to-end flow:

```
CUSTOMER                      INTERNAL (MAM Home)                       SUPPLIER
────────                      ───────────────────                       ────────
Send enquiry  ───────────▶    Enquiry appears in list
                              Calls customer → Project ID created
                              Discussion  → Order ID created
                              Pick suppliers by pincode (≤30),
                              enter requirement/note/qty/price ──────▶  Requirement received (Order ID)
                                                                        Reply with quotation
                              Quotations collected in                ◀── (PDF + duration + note)
                              "Comparison Sheet"
                              Shortlist top 5–10 → ask Final Quotation ▶ Final quotation
                              Shortlist 1–2 → ask Final PO + Invoice  ▶ Final PO / Invoice
                              Edit supplier quote (add GST/tax/margin)
Receive quotation  ◀────────  Send quotation to customer (+temp supplier id)
Confirm quotation ──────────▶ Ask advance payment
Pay advance  ───────────────▶ Delivery ID created (invoice, PO,
                              bill, GST, e-way, vehicle no/name/number)
Track delivery status ◀─────  Update delivery status
```

## ID continuation rules (derived from the old DB)

The new system **never restarts** these series — it continues from the last value used in the
legacy database.

| Entity      | Format (example)             | Last legacy value | Next value    |
|-------------|------------------------------|-------------------|---------------|
| Customer    | `MH_91_Z1_C1822`             | **C1822**         | `...C1823`    |
| Supplier    | `MH_91_Z1_S100`              | **S100**          | `...S101`     |
| Order       | `MH_91_Z1_{YEAR}_O5423`      | **O5423**         | `...O5424`    |
| Invoice     | `MH_91_Z1_{YEAR}_IN{n}`      | (continued)       | next `IN`     |
| Project     | numeric, e.g. `29707`        | **29707**         | `29708`       |
| Delivery    | `MH_91_Z1_{YEAR}_DLV{n}`     | new series        | `DLV1`        |

> Note: the region prefix `MH_91_Z1_` (state / country-code / zone) and the numeric suffix are
> preserved exactly. The order/invoice numeric counter is **global** across years; the 4-digit year
> is stamped from the creation date. Counters live in the `id_counters` table and are advanced
> atomically per generated ID.

## Region data policy

The legacy records have `city / state / country / pincode` mostly **NULL**. In the new system these
fields are first-class and are kept up to date. The Internal member updates existing customer/supplier
region details via the **Edit** action, and captures them for every **new** record via **Add**.

## Getting started

```bash
# 1. Backend
cd backend
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm install
npm run db:setup              # create schema + seed id_counters at legacy values
npm run db:import-legacy      # import old customers & suppliers from the provided dumps
npm run dev                   # start API on http://localhost:4000

# 2. Mobile
cd ../mobile
npm install
npm start                     # Expo — open on device/emulator
```

See [`backend/README.md`](backend/README.md) and [`mobile/README.md`](mobile/README.md) for details.
