-- ============================================================================
-- MMT Mobile Application — PostgreSQL schema
-- Shared by all three interfaces: Customer, Internal (MAM Home), Supplier.
-- The whole procurement workflow is linked by the ORDER ID.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ID counters: continue the legacy series (never restart).
-- Seeded in scripts/setupDb.js at the last legacy values.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS id_counters (
  name  TEXT PRIMARY KEY,        -- 'customer' | 'supplier' | 'order' | 'invoice' | 'project' | 'delivery'
  value BIGINT NOT NULL          -- last used numeric suffix
);

-- ---------------------------------------------------------------------------
-- Auth users. Every login maps to exactly one role. Customer/Supplier logins
-- are linked to their business record; Internal users are company employees.
-- ---------------------------------------------------------------------------
-- Internal employees log in with their email; customers/suppliers log in with
-- their business ID (customer_id / supplier_id) — the login username IS the ID,
-- issued by an internal member together with a password. email is therefore
-- optional (nullable) and only used for internal accounts (and as contact info).
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('customer', 'internal', 'supplier')),
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  customer_id   TEXT,            -- FK -> customers.customer_id (for role = customer)
  supplier_id   TEXT,            -- FK -> suppliers.supplier_id (for role = supplier)
  staff_role    TEXT,            -- for role = internal: 'admin' | 'manager' | 'listing_engineer'
  push_token    TEXT,            -- Expo push token for this device/login
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One login per business ID; the ID doubles as the login username.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_id ON users (customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supplier_id ON users (supplier_id) WHERE supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Customers (mirrors legacy customer_details, with region fields promoted to
-- first-class + kept up to date).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  customer_id       TEXT PRIMARY KEY,        -- e.g. MH_91_Z1_C1823
  first_name        TEXT,
  last_name         TEXT,
  customer_gst      TEXT,
  email             TEXT,
  address           TEXT,
  street            TEXT,
  city              TEXT,
  state             TEXT,
  country           TEXT,
  pincode           TEXT,
  landline          TEXT,
  mobile_num        TEXT,
  alt_mobile        TEXT,
  pan_no            TEXT,
  aadhar_number     TEXT,
  bank_account_number TEXT,
  customer_type     TEXT,
  sub_customer_type TEXT,
  latitude          TEXT,
  longitude         TEXT,
  status            TEXT,
  remark            TEXT,
  updated_by        TEXT,
  legacy_id         INTEGER,                 -- old numeric id, for traceability
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_pincode ON customers (pincode);

-- ---------------------------------------------------------------------------
-- Suppliers (mirrors legacy suplier_details, region fields promoted).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id         TEXT PRIMARY KEY,      -- e.g. MH_91_Z1_S101
  supplier_firm_name  TEXT,
  contact_person_name TEXT,
  email               TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  country             TEXT,
  pincode             TEXT,
  ward                TEXT,
  zone                TEXT,
  landline            TEXT,
  mobile              TEXT,
  alt_number          TEXT,
  fax_num             TEXT,
  current_gst_info    TEXT,
  pan_number          TEXT,
  aadhar_number       TEXT,
  account_number      TEXT,
  account_holder_name TEXT,
  ifsc                TEXT,
  branch              TEXT,
  bank_name           TEXT,
  supplier_type       TEXT,
  status              TEXT,
  legacy_id           INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_pincode ON suppliers (pincode);

-- ---------------------------------------------------------------------------
-- Enquiries: raised by the Customer interface, appear on top of Internal.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  enquiry_id   TEXT PRIMARY KEY,             -- e.g. MH_91_Z1_2026_E1
  customer_id  TEXT NOT NULL REFERENCES customers (customer_id),
  category     TEXT,
  subject      TEXT,
  message      TEXT NOT NULL,                -- requirement description
  quantity     TEXT,
  unit         TEXT,
  target_price TEXT,
  location     TEXT,
  pincode      TEXT,
  contact_phone TEXT,
  status       TEXT NOT NULL DEFAULT 'new'   -- new | in_discussion | quoted | closed
    CHECK (status IN ('new', 'in_discussion', 'quoted', 'closed')),
  project_id   TEXT,                          -- set once Internal creates a project
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries (customer_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries (status);

-- ---------------------------------------------------------------------------
-- Projects: created by Internal after discussion. Continues numeric series.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  project_id  TEXT PRIMARY KEY,              -- numeric string, e.g. 29708
  customer_id TEXT NOT NULL REFERENCES customers (customer_id),
  enquiry_id  TEXT REFERENCES enquiries (enquiry_id),
  created_by  INTEGER REFERENCES users (id),
  ward        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Orders: created once a project is generated. The spine of the workflow.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  order_id     TEXT PRIMARY KEY,             -- e.g. MH_91_Z1_2026_O5424
  project_id   TEXT REFERENCES projects (project_id),
  customer_id  TEXT NOT NULL REFERENCES customers (customer_id),
  enquiry_id   TEXT REFERENCES enquiries (enquiry_id),
  requirement  TEXT,                          -- requirement message sent to suppliers
  note         TEXT,                          -- rules / conditions / mandatory
  quantity     TEXT,
  price_range  TEXT,
  pincode      TEXT,
  status       TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'sent_to_suppliers', 'quotes_received',
                      'shortlisted', 'finalized', 'quoted_to_customer',
                      'confirmed', 'in_delivery', 'completed', 'cancelled')),
  created_by   INTEGER REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- ---------------------------------------------------------------------------
-- Order ⇄ Supplier fan-out: the (≤30) suppliers a requirement was sent to.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_suppliers (
  id          SERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers (supplier_id),
  stage       TEXT NOT NULL DEFAULT 'requirement'  -- requirement | final_quotation | final_po
    CHECK (stage IN ('requirement', 'final_quotation', 'final_po')),
  status      TEXT NOT NULL DEFAULT 'sent'         -- sent | responded | shortlisted | finalized | rejected
    CHECK (status IN ('sent', 'responded', 'shortlisted', 'finalized', 'rejected')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_order_suppliers_supplier ON order_suppliers (supplier_id);

-- ---------------------------------------------------------------------------
-- Supplier quotations = rows of the "Comparison Sheet".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_quotations (
  id            SERIAL PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  supplier_id   TEXT NOT NULL REFERENCES suppliers (supplier_id),
  price         NUMERIC,
  quantity      TEXT,
  duration      TEXT,
  duration_unit TEXT,                          -- hrs | days | weeks
  note          TEXT,                          -- condition / policy / rules
  document_url  TEXT,                          -- uploaded quotation PDF
  stage         TEXT NOT NULL DEFAULT 'quotation'
    CHECK (stage IN ('quotation', 'final_quotation', 'final_po', 'invoice')),
  status        TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'shortlisted', 'finalized', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_order ON supplier_quotations (order_id);

-- ---------------------------------------------------------------------------
-- Customer quotations = the quote Internal sends to the customer (supplier
-- quote edited with our GST/tax/margin + a temporary supplier id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_quotations (
  quotation_id            TEXT PRIMARY KEY,   -- e.g. MH_91_Z1_2026_Q1
  order_id                TEXT NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  customer_id             TEXT NOT NULL REFERENCES customers (customer_id),
  based_on_supplier_quote INTEGER REFERENCES supplier_quotations (id),
  temp_supplier_id        TEXT,               -- masked supplier id shown to customer
  base_amount             NUMERIC,
  gst_percent             NUMERIC,
  tax_amount              NUMERIC,
  margin                  NUMERIC,
  total_amount            NUMERIC,
  quantity                TEXT,
  duration                TEXT,
  note                    TEXT,
  document_url            TEXT,
  status                  TEXT NOT NULL DEFAULT 'sent'  -- sent | confirmed | rejected
    CHECK (status IN ('sent', 'confirmed', 'rejected')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_quotes_customer ON customer_quotations (customer_id);

-- ---------------------------------------------------------------------------
-- Deliveries: created after advance payment. Continues via id_counters.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id     TEXT PRIMARY KEY,           -- e.g. MH_91_Z1_2026_DLV1
  order_id        TEXT NOT NULL REFERENCES orders (order_id),
  project_id      TEXT REFERENCES projects (project_id),
  customer_id     TEXT NOT NULL REFERENCES customers (customer_id),
  supplier_id     TEXT REFERENCES suppliers (supplier_id),
  invoice_no      TEXT,
  invoice_url     TEXT,
  po_url          TEXT,
  bill_url        TEXT,
  eway_bill_url   TEXT,
  truck_image_url TEXT,
  truck_video_url TEXT,
  onload_photo_url TEXT,           -- photo captured while loading (our side)
  onload_photo_at  TIMESTAMPTZ,    -- date/time captured with the on-load photo
  onsite_photo_url TEXT,           -- photo captured at the delivery site
  onsite_photo_at  TIMESTAMPTZ,    -- date/time captured with the onsite photo
  vehicle_number  TEXT,
  driver_name     TEXT,
  driver_number   TEXT,
  delivery_location TEXT,
  district        TEXT,
  postal_code     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatched', 'in_transit', 'delivered', 'cancelled')),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries (customer_id);

-- ---------------------------------------------------------------------------
-- Payments: advance + final settlements against an order/delivery.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  order_id     TEXT REFERENCES orders (order_id),
  delivery_id  TEXT REFERENCES deliveries (delivery_id),
  customer_id  TEXT NOT NULL REFERENCES customers (customer_id),
  amount       NUMERIC NOT NULL,
  type         TEXT NOT NULL DEFAULT 'advance'  -- advance | final | refund
    CHECK (type IN ('advance', 'final', 'refund')),
  method       TEXT,
  reference    TEXT,
  remark       TEXT,
  gateway_order_id TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);

-- ---------------------------------------------------------------------------
-- Notifications: offers, status updates, quotation alerts, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users (id) ON DELETE CASCADE,
  customer_id TEXT,
  supplier_id TEXT,
  type        TEXT NOT NULL DEFAULT 'general' -- general | offer | quotation | order | delivery | payment
    CHECK (type IN ('general', 'offer', 'quotation', 'order', 'delivery', 'payment')),
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications (customer_id);

-- ---------------------------------------------------------------------------
-- Listings: projects a Listing Engineer records via a form. Grouped per
-- engineer per day; Admin/Manager view + edit all, engineers see only their own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id            SERIAL PRIMARY KEY,
  engineer_id   INTEGER NOT NULL REFERENCES users (id),
  engineer_name TEXT,
  project_name  TEXT,
  customer_name TEXT,
  phone         TEXT,
  location      TEXT,
  pincode       TEXT,
  category      TEXT,
  requirement   TEXT,
  quantity      TEXT,
  budget        TEXT,
  status        TEXT NOT NULL DEFAULT 'follow_up'
    CHECK (status IN ('positive', 'negative', 'follow_up')),
  remark        TEXT,
  listing_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_engineer_date ON listings (engineer_id, listing_date);

-- Day reports generated by a Listing Engineer (one per engineer per day).
CREATE TABLE IF NOT EXISTS day_reports (
  id            SERIAL PRIMARY KEY,
  engineer_id   INTEGER NOT NULL REFERENCES users (id),
  engineer_name TEXT,
  report_date   DATE NOT NULL,
  total         INTEGER NOT NULL DEFAULT 0,
  positive      INTEGER NOT NULL DEFAULT 0,
  negative      INTEGER NOT NULL DEFAULT 0,
  follow_up     INTEGER NOT NULL DEFAULT 0,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (engineer_id, report_date)
);
