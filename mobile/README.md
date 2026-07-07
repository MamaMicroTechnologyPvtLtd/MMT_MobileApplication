# MMT Mobile (React Native / Expo)

The **Customer interface** — built first. Internal and Supplier interfaces follow, reusing the same
API client, auth context, and design system.

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

## Structure

```
mobile/
├── App.js                    Navigation root (auth stack ↔ customer tabs)
└── src/
    ├── api/client.js         Fetch wrapper + token storage
    ├── context/AuthContext.js  Session, login/register/logout
    ├── theme.js              Colours, spacing, status colours
    ├── components/           Button, Field, Card, Badge, ProfileButton…
    └── screens/              Login, Register, Enquiry, Quotations, History, Profile
```

## Notes

- Messaging is **in-app** for now (enquiries/quotations/notifications flow through the API).
  WhatsApp bulk-send for the Internal interface is a later phase.
- The design system (`theme.js` + `components/ui.js`) is shared, so the Internal and Supplier
  interfaces will look consistent when added.
