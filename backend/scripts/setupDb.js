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
