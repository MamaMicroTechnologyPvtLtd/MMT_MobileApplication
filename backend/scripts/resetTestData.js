// Wipe TEST data and start fresh, while keeping the legacy-imported customers &
// suppliers and the employee logins. Run: npm run db:reset-test
//
// Deletes: all workflow data (enquiries, projects, orders, quotations,
// deliveries, payments, notifications) and any customer/supplier records created
// during testing (i.e. NOT imported from the old DB — legacy_id IS NULL) plus
// their logins. Resets the ID counters back to the post-import baseline so the
// next new customer is C1823, supplier S101, order O5424, project 29708.

const { pool } = require('../src/config/db');

// Post-import baseline (matches setupDb + importLegacy).
const BASELINE = {
  customer: 1822,
  supplier: 100,
  order: 5423,
  project: 29707,
  invoice: 2974,
  enquiry: 0,
  quotation: 0,
  delivery: 0,
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Workflow / transactional data — all of it is test data.
    for (const table of [
      'notifications', 'payments', 'deliveries', 'customer_quotations',
      'supplier_quotations', 'order_suppliers', 'orders', 'projects', 'enquiries',
    ]) {
      const r = await client.query(`DELETE FROM ${table}`);
      // eslint-disable-next-line no-console
      console.log(`  cleared ${table}: ${r.rowCount}`);
    }

    // Logins for test customers/suppliers (keep employee logins).
    await client.query(
      `DELETE FROM users WHERE role = 'customer'
        AND customer_id IN (SELECT customer_id FROM customers WHERE legacy_id IS NULL)`
    );
    await client.query(
      `DELETE FROM users WHERE role = 'supplier'
        AND supplier_id IN (SELECT supplier_id FROM suppliers WHERE legacy_id IS NULL)`
    );

    // Test customer/supplier records (created during testing).
    const dc = await client.query('DELETE FROM customers WHERE legacy_id IS NULL');
    const ds = await client.query('DELETE FROM suppliers WHERE legacy_id IS NULL');
    // eslint-disable-next-line no-console
    console.log(`  removed test customers: ${dc.rowCount}, test suppliers: ${ds.rowCount}`);

    // Reset counters to the post-import baseline.
    for (const [name, value] of Object.entries(BASELINE)) {
      await client.query('UPDATE id_counters SET value = $2 WHERE name = $1', [name, value]);
    }

    await client.query('COMMIT');
    const { rows } = await client.query(
      'SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM suppliers) AS suppliers'
    );
    // eslint-disable-next-line no-console
    console.log(`✓ reset done. customers=${rows[0].customers} suppliers=${rows[0].suppliers} (legacy only). Next: C1823 / S101.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
