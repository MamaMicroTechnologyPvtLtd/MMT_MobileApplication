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
  // delivery media (truck photo/video).
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS truck_image_url TEXT');
  await pool.query('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS truck_video_url TEXT');
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
