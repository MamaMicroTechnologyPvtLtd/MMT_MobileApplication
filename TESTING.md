# Local setup & workflow test

Step-by-step guide to run the MMT app on your own machine and walk the full
Customer → Internal → Supplier workflow before deploying for real use.

## 0. Prerequisites

- **Node.js 18+** (tested on Node 22) and npm
- **PostgreSQL 14+** running locally (tested on 16)
- **A phone with Expo Go** (Android/iOS) on the **same Wi‑Fi** as your PC, or an emulator
- Git

## 1. Get the code

```bash
git clone <repo-url>
cd MMT_MobileApplication
git checkout claude/customer-internal-interfaces-4975vz
```

## 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL=postgres://<user>:<pass>@localhost:5432/mmt`
- `JWT_SECRET=<any long random string>`
- Leave WhatsApp/Razorpay keys **blank** for testing (free deep-link + mock modes).

Create the database once, then set up the schema and data:

```bash
createdb mmt                 # or: psql -c "CREATE DATABASE mmt;"
npm install
npm run db:setup             # schema + ID counters at legacy values
npm run db:import-legacy     # import old customers & suppliers (801 + 43)
npm run db:seed-employees    # creates admin@ / manager@ logins
npm run dev                  # API on http://localhost:4000
```

Quick check: open <http://localhost:4000/api/health> → `{"status":"ok",...}`.

Seed logins printed by `db:seed-employees`:
- `admin@mamamicrotechnology.com` / `Admin@MMT2026`
- `manager@mamamicrotechnology.com` / `Manager@MMT2026`

## 3. Mobile

```bash
cd ../mobile
npm install
npx expo install             # aligns Expo SDK 51 dependency versions
```

Point the app at your backend. In `app.json` set:
```json
"extra": { "apiBaseUrl": "http://<YOUR_PC_LAN_IP>:4000/api" }
```
Use your PC's LAN IP (e.g. `http://192.168.1.20:4000/api`) — **`localhost` will not work
from a physical phone**. Find it with `ipconfig` (Windows) or `ifconfig`/`ip a` (macOS/Linux).

```bash
npm start                    # scan the QR code in Expo Go
```

> First run notes (normal, not bugs): run `npx expo install` once so dependency
> versions match your Expo SDK. Push notifications only work on a real device and,
> for a standalone build, need an Expo project id — the app no-ops gracefully
> otherwise, so it does not block testing.

## 4. Walk the workflow

1. **Employee** — log in as `admin@mamamicrotechnology.com`. You land on the **Dashboard**.
2. **Directory → Add customer** → note the issued **ID + password**. Repeat **Add supplier**
   (a few, with the **same pincode**, e.g. `560064`) — note each supplier's ID + password.
3. **Customer** — log out, log in with the customer **ID + password**. Send an **enquiry**
   (set the pincode). Log out.
4. **Employee** — the enquiry shows on **Enquiries**. Tap **Create project + order → suppliers**.
   Enter the pincode, **select up to 30 suppliers**, fill requirement/note/qty/price, **SEND**.
   (You'll also get per-supplier **WhatsApp** links.)
5. **Supplier** — log in with a supplier **ID + password**. Open the requirement, **Reply**
   with a quotation (attach a PDF, set duration hrs/days/weeks, note). Submit.
6. **Employee** — open the order → **Comparison Sheet** (tap **Export Excel** to download).
   Use a quote → **send to customer** (add GST/tax/margin). Optionally **Ask Final PO**.
7. **Customer** — see the quotation under **Quotations** → **Confirm**.
8. **Employee** — raise an **advance payment**; **Customer** pays it under **Payments**
   (mock mode settles instantly). Then **Employee** creates the **Delivery** (attach truck
   photo/video + docs, vehicle/driver) and updates status.
9. **Customer** — track everything under **History** (enquiries, quotations, deliveries with
   photo links, payments, offers).

## 5. Reset (start clean any time)

```bash
cd backend
psql -c "DROP DATABASE IF EXISTS mmt;" -c "CREATE DATABASE mmt;"
npm run db:setup && npm run db:import-legacy && npm run db:seed-employees
```

## 6. Before real deployment

- Strong `JWT_SECRET`; change the seed admin passwords; managed PostgreSQL with backups.
- Serve the API over **HTTPS**; move `/uploads` to durable storage.
- Add `RAZORPAY_*` and/or `WHATSAPP_*` keys only when you want those live (see main README →
  *Costs & third-party integrations*).
