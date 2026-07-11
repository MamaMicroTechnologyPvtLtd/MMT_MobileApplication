// ============================================================================
// Bump the ID counters so new records continue from the REAL latest values in
// the old system. Use this when the legacy dump in the repo is older than the
// live old database (e.g. the dump maxes at order O5423 but the real latest is
// O6178). Values are applied with GREATEST(), so a counter is only ever raised,
// never lowered below data already present.
//
//   node scripts/setCounters.js order=6178 project=30000 customer=1900 supplier=110
//   npm run db:set-counters -- order=6178 project=30000
//
// Run with no args to just print the current counters.
// ============================================================================

const { pool } = require('../src/config/db');

const VALID = ['customer', 'supplier', 'order', 'project', 'enquiry', 'quotation', 'delivery', 'invoice'];

async function printCounters() {
  const { rows } = await pool.query('SELECT name, value FROM id_counters ORDER BY name');
  // eslint-disable-next-line no-console
  console.log('Current counters:');
  for (const r of rows) console.log(`  ${r.name.padEnd(10)} ${r.value}`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a && a !== '--');
  if (args.length === 0) {
    await printCounters();
    // eslint-disable-next-line no-console
    console.log('\nUsage: npm run db:set-counters -- order=6178 project=30000 customer=1900 supplier=110');
    await pool.end();
    return;
  }

  const updates = [];
  for (const a of args) {
    const [name, val] = a.split('=');
    if (!VALID.includes(name)) throw new Error(`Unknown counter "${name}". Valid: ${VALID.join(', ')}`);
    if (!/^\d+$/.test(val || '')) throw new Error(`"${a}" must be name=<number>`);
    updates.push([name, Number(val)]);
  }

  for (const [name, val] of updates) {
    // GREATEST: never lower a counter below what already exists.
    await pool.query('UPDATE id_counters SET value = GREATEST(value, $2) WHERE name = $1', [name, val]);
    // eslint-disable-next-line no-console
    console.log(`  set ${name} → at least ${val}`);
  }
  // eslint-disable-next-line no-console
  console.log('');
  await printCounters();
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
});
