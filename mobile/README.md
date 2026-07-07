# MMT Mobile (React Native / Expo)

Role-based app: on login the user is routed to the interface for their role
(**Customer**, **Internal / MAMA Home**, or **Supplier**), all sharing one API client, auth context,
and design system.

**Access model:** only internal **employees** self-register (Register screen). Customers and
suppliers are created by an internal member in the Directory — the app then shows their issued
**login ID + password** to hand over. Everyone logs in on one screen: employees with their email,
customers/suppliers with their **business ID** (`C####` / `S##`).

## Run

```bash
npm install
# Point the app at your backend. On a simulator, localhost works.
# On a physical phone, set your machine's LAN IP in app.json > expo.extra.apiBaseUrl
npm start            # then press a for Android, i for iOS, or scan the QR in Expo Go
```

Make sure the backend is running (`cd ../backend && npm run dev`).

## Customer interface — what's built

Ordered exactly per the spec: **form first, responses next, history last, profile top-right.**

| Screen            | Purpose |
|-------------------|---------|
| **Login / Register** | Register as a customer (a `C####` id is allocated automatically) and log in. |
| **Send Enquiry** (home) | Input form to send an enquiry to Internal, plus your recent enquiries with status. |
| **Quotations**    | Receive the quotation for an enquiry from the internal member; **Confirm** or **Reject**. |
| **History**       | Category-wise: Enquiries · Quotations · Deliveries · Payments · Offers (notifications). |
| **Profile** (top-right avatar) | Details of the registered + logged-in customer; log out. |

## Internal (MAM Home) interface — what's built

Layout per the spec: **enquiries on top → pincode + supplier select + requirement → SEND → Comparison
Sheet → quote customer → delivery.** Profile top-right, history last.

| Screen              | Purpose |
|---------------------|---------|
| **Enquiries** (home) | Customer enquiries on top; one tap creates Project + Order and opens the requirement form. |
| **Send Requirement** | Enter pincode → list suppliers in that locality → select **up to 30** → requirement / note / quantity / price → **SEND** to all at once. |
| **Orders → Order detail** | The **Comparison Sheet** (person, company, location, GST, phone, mail, price, qty, duration, note) with per-supplier **Shortlist / Ask Final Quotation / Ask Final PO**, and **Export Excel** (.xlsx). |
| **Quote Customer**   | Take a supplier quote, add GST / tax / margin (live total) + temp supplier id, send to the customer. |
| **Create Delivery**  | Delivery ID + invoice/PO/bill/e-way links + vehicle & driver + status. |
| **Directory**        | Search customers/suppliers by name or pincode; **Add** (continues the id series) or **Edit** existing. |
| **History**          | Category-wise: Enquiries · Orders · Deliveries · Payments · Alerts. |

## Supplier interface — what's built

Per the spec: **receive requirement (Order ID + details) → Reply → quotation PDF + duration
(hrs/days/weeks) + note → submit → goes to Internal.** Below, Final Quotation / Final PO requests.

| Screen             | Purpose |
|--------------------|---------|
| **Requirements** (home) | Requirements received from the MMT team (Order ID + requirement + note + qty + price range), each with a **Reply** button. Final Quotation / PO requests are highlighted. |
| **Reply**          | Attach a quotation **PDF** (or image), set **duration** with a hrs/days/weeks selector, optional price/quantity, add a **note**, and submit. Reused for Final Quotation / Final PO. |
| **Alerts**         | Notifications for the supplier. |
| **Profile** (top-right) | Firm details of the logged-in supplier; log out. |

File uploads use `expo-document-picker` → `POST /api/uploads` (served back from `/uploads`).

## Structure

```
mobile/
├── App.js                    Role-based navigation root (customer / internal / supplier)
└── src/
    ├── api/client.js         Fetch wrapper + token storage
    ├── context/AuthContext.js  Session, login/register/logout
    ├── theme.js              Colours, spacing, status colours
    ├── components/           Button, Field, Card, Badge, ProfileButton…
    └── screens/
        ├── (customer)        Enquiry, Quotations, History, Profile
        ├── internal/         Enquiries, Orders, OrderDetail, SendRequirement,
        │                     QuoteCustomer, CreateDelivery, Directory, Customer/Supplier forms
        └── supplier/         Requirements inbox, Reply (PDF + duration + note)
```

## Notes

- Messaging is **in-app** for now (enquiries/quotations/notifications flow through the API).
  WhatsApp bulk-send for the Internal interface is a later phase.
- The design system (`theme.js` + `components/ui.js`) is shared, so the Internal and Supplier
  interfaces will look consistent when added.
