// ============================================================================
// Fold extra customer detail from the old MySQL side-tables (GST numbers and
// additional contact numbers) into existing customer records — WITHOUT dropping
// or re-importing anything. Safe to re-run: it only fills fields that are still
// blank, so any details already entered by Admin/Manager are left untouched.
//
//   node scripts/refreshLegacyDetails.js [customerDump]
//
// Defaults to backend/data/legacy/customer_db.sql
// ============================================================================

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');
const { importCustomerGst, importCustomerNumbers } = require('./importLegacy');

async function main() {
  const customerPath = process.argv[2] || path.join(__dirname, '..', 'data', 'legacy', 'customer_db.sql');
  const customerSql = fs.readFileSync(customerPath, 'utf8');

  const { rows } = await pool.query('SELECT customer_id FROM customers');
  const customerSet = new Set(rows.map((x) => x.customer_id));

  const gst = await importCustomerGst(customerSql, customerSet);
  const nums = await importCustomerNumbers(customerSql, customerSet);
  // eslint-disable-next-line no-console
  console.log(`✓ customer GST folded in: ${gst.updated}; extra numbers: ${nums.updated}`);

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
