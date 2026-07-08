// Wipe TEST data and start fresh, while keeping the legacy-imported customers &
// suppliers and the employee logins. Run: npm run db:reset-test
//
// Deletes: all workflow data (enquiries, projects, orders, quotations,
// deliveries, payments, notifications) and any customer/supplier records created
// during testing (i.e. NOT imported from the old DB — legacy_id IS NULL) plus
// their logins. Resets the ID counters back to the post-import baseline so the
// next new customer is C1823, supplier S101, order O5424, project 29708.

const { pool } = require('../src/config/db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fully-test child tables (legacy import never created these) — these
    // reference orders/deliveries, so clear them first.
    for (const table of [
      'notifications', 'payments', 'deliveries', 'customer_quotations',
      'supplier_quotations', 'order_suppliers',
    ]) {
      const r = await client.query(`DELETE FROM ${table}`);
      // eslint-disable-next-line no-console
      console.log(`  cleared ${table}: ${r.rowCount}`);
    }

    // Orders & projects: keep the legacy-imported ones (created_by IS NULL),
    // delete only those created during testing (created_by = an employee).
    // Test orders reference enquiries, so delete them before enquiries; test
    // projects are referenced by enquiries, so delete them after.
    const dor = await client.query('DELETE FROM orders WHERE created_by IS NOT NULL');
    const den = await client.query('DELETE FROM enquiries');
    const dpr = await client.query('DELETE FROM projects WHERE created_by IS NOT NULL');
    // eslint-disable-next-line no-console
    console.log(`  removed test orders: ${dor.rowCount}, enquiries: ${den.rowCount}, test projects: ${dpr.rowCount}`);

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

    // Recompute counters from the remaining (legacy) data so new ids continue
    // correctly; reset the purely-test counters to 0.
    const recompute = async (name, sql, fallback) => {
      const { rows } = await client.query(sql);
      const val = Math.max(Number(rows[0].v) || 0, fallback);
      await client.query('UPDATE id_counters SET value = $2 WHERE name = $1', [name, val]);
    };
    await recompute('customer',
      "SELECT COALESCE(MAX((regexp_replace(customer_id,'.*_C',''))::int),0) AS v FROM customers WHERE customer_id ~ '_C[0-9]+$'", 1822);
    await recompute('supplier',
      "SELECT COALESCE(MAX((regexp_replace(supplier_id,'.*_S',''))::int),0) AS v FROM suppliers WHERE supplier_id ~ '_S[0-9]+$'", 100);
    await recompute('project',
      "SELECT COALESCE(MAX(project_id::int),0) AS v FROM projects WHERE project_id ~ '^[0-9]+$'", 0);
    await recompute('order',
      "SELECT COALESCE(MAX((regexp_replace(order_id,'.*_O',''))::int),0) AS v FROM orders WHERE order_id ~ '_O[0-9]+$'", 5423);
    for (const name of ['enquiry', 'quotation', 'delivery']) {
      await client.query('UPDATE id_counters SET value = 0 WHERE name = $1', [name]);
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
