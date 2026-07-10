// Create the schema and seed the id_counters at the last legacy values.
// Idempotent: safe to run repeatedly (schema uses IF NOT EXISTS; counters are
// only inserted when missing so a re-run never rewinds a live counter).

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

// Last numeric suffix used in the legacy database (see README ID rules).
const LEGACY_COUNTERS = {
  customer: 1822, // MH_91_Z1_C1822
  supplier: 100, // MH_91_Z1_S100
  order: 5423, // MH_91_Z1_2024_O5423
  invoice: 0, // recomputed by importLegacy from the data
  project: 29707, // max numeric project_id
  delivery: 0, // new series
  enquiry: 0, // new series
  quotation: 0, // new series
};

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  // Idempotent column additions for databases created before a column existed.
  await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT');
  // email is optional now (customers/suppliers log in by ID, not email).
  await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
  // delivery media (truck photo/video + timestamped on-load / onsite photos).
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS truck_image_url TEXT');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS truck_video_url TEXT');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS onload_photo_url TEXT');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS onload_photo_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS onsite_photo_url TEXT');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS onsite_photo_at TIMESTAMPTZ');
  // Expo push token per login.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT');
  // Enquiry contact phone (for old/new project enquiries).
  await pool.query('ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS contact_phone TEXT');
  // Internal staff sub-role.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_role TEXT');
  // Category taxonomy on enquiries/orders.
  await pool.query('ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS subcategory TEXT');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS category TEXT');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS subcategory TEXT');
  // Supplier quotation dynamic answers.
  await pool.query("ALTER TABLE supplier_quotations ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'");
  await pool.query('ALTER TABLE supplier_quotations ADD COLUMN IF NOT EXISTS message TEXT');
  // 'deferred' status (internal "get back later").
  await pool.query('ALTER TABLE supplier_quotations DROP CONSTRAINT IF EXISTS supplier_quotations_status_check');
  await pool.query(`ALTER TABLE supplier_quotations ADD CONSTRAINT supplier_quotations_status_check
                    CHECK (status IN ('received','shortlisted','finalized','rejected','deferred'))`);
  // Internal PO attached when asking a supplier for the final quotation.
  await pool.query('ALTER TABLE order_suppliers ADD COLUMN IF NOT EXISTS po_url TEXT');
  // A listing can carry many materials (cement, steel, sand …) each with its own
  // quantity + unit.
  await pool.query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'");
  // An enquiry can request several materials at once, each a category/subcategory
  // with its own quantity + unit. category/subcategory columns mirror the first.
  await pool.query("ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'");
  // Supplier confirmation of the final quotation → order confirmed for them.
  await pool.query('ALTER TABLE supplier_quotations DROP CONSTRAINT IF EXISTS supplier_quotations_status_check');
  await pool.query(`ALTER TABLE supplier_quotations ADD CONSTRAINT supplier_quotations_status_check
                    CHECK (status IN ('received','shortlisted','finalized','rejected','deferred','confirmed'))`);
  await pool.query('ALTER TABLE order_suppliers DROP CONSTRAINT IF EXISTS order_suppliers_status_check');
  await pool.query(`ALTER TABLE order_suppliers ADD CONSTRAINT order_suppliers_status_check
                    CHECK (status IN ('sent','responded','shortlisted','finalized','rejected','confirmed'))`);

  // Seed a default category taxonomy (idempotent).
  const TAXONOMY = {
    Cement: ['OPC 43 Grade', 'OPC 53 Grade', 'PPC', 'White Cement'],
    'Steel (TMT)': ['Fe500', 'Fe550', 'Fe500D'],
    Sanitary: ['Pipes & Fittings', 'Taps & Faucets', 'Closets & Basins'],
    Electrical: ['Wires & Cables', 'Switches & Sockets', 'MCB & DB', 'Lights'],
    Paints: ['Interior', 'Exterior', 'Primer & Putty'],
    Aggregates: ['M-Sand', 'Jelly / Blue Metal', 'Gravel'],
    'Bricks & Blocks': ['Solid Blocks', 'Hollow Blocks', 'Red Bricks'],
  };
  for (const [cat, subs] of Object.entries(TAXONOMY)) {
    const { rows } = await pool.query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [cat]
    );
    const catId = rows[0].id;
    for (const sub of subs) {
      await pool.query(
        `INSERT INTO subcategories (category_id, name) VALUES ($1, $2)
         ON CONFLICT (category_id, name) DO NOTHING`,
        [catId, sub]
      );
    }
  }
  // Payment gateway fields + 'processing' status + manual-payment remark.
  await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_order_id TEXT');
  await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS remark TEXT');
  await pool.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check`);
  await pool.query(`ALTER TABLE payments ADD CONSTRAINT payments_status_check
                    CHECK (status IN ('pending', 'processing', 'paid', 'failed'))`);
  // eslint-disable-next-line no-console
  console.log('✓ schema applied');

  for (const [name, value] of Object.entries(LEGACY_COUNTERS)) {
    await pool.query(
      `INSERT INTO id_counters (name, value) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, value]
    );
  }
  // eslint-disable-next-line no-console
  console.log('✓ id_counters seeded at legacy values');

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
