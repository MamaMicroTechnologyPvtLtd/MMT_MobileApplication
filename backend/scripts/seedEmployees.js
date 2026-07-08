// Seed a couple of internal employee accounts (e.g. an admin) so the system has
// a way in on a fresh database. Idempotent: existing accounts are left as-is
// (passwords are never reset here). Run: npm run db:seed-employees
//
// Passwords come from env with sensible defaults; override before first run:
//   SEED_ADMIN_PASSWORD=... SEED_MANAGER_PASSWORD=... npm run db:seed-employees

const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const DOMAIN = (process.env.EMPLOYEE_EMAIL_DOMAINS || 'mamamicrotechnology.com')
  .split(',')[0].trim().toLowerCase();

const EMPLOYEES = [
  {
    email: `admin@${DOMAIN}`,
    full_name: 'MMT Admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@MMT2026',
    staff_role: 'admin',
  },
  {
    email: `manager@${DOMAIN}`,
    full_name: 'MMT Manager',
    password: process.env.SEED_MANAGER_PASSWORD || 'Manager@MMT2026',
    staff_role: 'manager',
  },
];

async function main() {
  const created = [];
  for (const emp of EMPLOYEES) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [emp.email]);
    if (existing.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`• ${emp.email} — already exists, skipped`);
      continue;
    }
    const password_hash = await bcrypt.hash(emp.password, 10);
    await pool.query(
      `INSERT INTO users (role, email, password_hash, full_name, staff_role)
       VALUES ('internal', $1, $2, $3, $4)`,
      [emp.email, password_hash, emp.full_name, emp.staff_role]
    );
    created.push(emp);
    // eslint-disable-next-line no-console
    console.log(`✓ created ${emp.email}`);
  }

  if (created.length) {
    // eslint-disable-next-line no-console
    console.log('\nSeed employee credentials (change the passwords after first login):');
    for (const emp of created) {
      // eslint-disable-next-line no-console
      console.log(`   ${emp.email}  /  ${emp.password}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
