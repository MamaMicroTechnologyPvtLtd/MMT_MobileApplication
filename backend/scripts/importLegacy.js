// ============================================================================
// Import legacy customers & suppliers from the old MySQL dumps into Postgres,
// then advance the id_counters so the new system continues the series.
//
//   node scripts/importLegacy.js [customerDump] [supplierDump]
//
// Defaults to backend/data/legacy/{customer_db,suplier_db}.sql
// ============================================================================

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

// ----------------------------------------------------------------------------
// Minimal MySQL INSERT parser: pull every tuple for a given table name.
// Handles quoted strings, backslash escapes, and NULL. Good enough for
// mysqldump output (which is what these files are).
// ----------------------------------------------------------------------------
function parseInsertTuples(sql, tableName) {
  const tuples = [];
  const marker = `INSERT INTO \`${tableName}\``;
  let idx = sql.indexOf(marker);

  while (idx !== -1) {
    const valuesIdx = sql.indexOf('VALUES', idx);
    if (valuesIdx === -1) break;
    // Statement ends at the first semicolon that is not inside a string.
    let i = valuesIdx + 'VALUES'.length;
    let inString = false;   // currently inside a '...' literal
    let quoted = false;     // the current field is a string literal
    let closed = false;     // the current field's string literal has ended
    let depth = 0;
    let field = '';
    let tuple = null;

    const pushField = () => {
      tuple.push(normalize(field, quoted));
      field = '';
      quoted = false;
      closed = false;
    };

    for (; i < sql.length; i += 1) {
      const ch = sql[i];
      if (inString) {
        if (ch === '\\') {
          field += sql[i + 1] ?? '';
          i += 1;
        } else if (ch === "'") {
          inString = false;
          closed = true; // ignore any whitespace before the next delimiter
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === "'") {
        // Opening quote: discard any whitespace captured before it.
        inString = true;
        quoted = true;
        field = '';
      } else if (ch === '(') {
        if (depth === 0) {
          tuple = [];
          field = '';
          quoted = false;
          closed = false;
        }
        depth += 1;
        if (depth > 1 && !closed) field += ch;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          pushField();
          tuples.push(tuple.slice());
          tuple = null;
        } else if (!closed) {
          field += ch;
        }
      } else if (ch === ',' && depth === 1) {
        pushField();
      } else if (ch === ';' && depth === 0) {
        break;
      } else if (depth >= 1 && !closed) {
        field += ch;
      }
    }

    idx = sql.indexOf(marker, i);
  }
  return tuples;
}

// Convert a raw field to a JS value. Unquoted NULL -> null; quoted stays as-is.
function normalize(raw, wasQuoted) {
  if (wasQuoted) return raw;
  const trimmed = raw.trim();
  if (trimmed === 'NULL' || trimmed === '') return null;
  return trimmed;
}

// mysqldump zero-dates are invalid in Postgres.
function cleanTimestamp(v) {
  if (!v) return null;
  if (v.startsWith('0000-00-00')) return null;
  return v;
}

function maxNumericSuffix(ids, letter) {
  let max = 0;
  const re = new RegExp(`_${letter}(\\d+)$`);
  for (const id of ids) {
    if (!id) continue;
    const m = String(id).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

async function importCustomers(sql) {
  // Legacy customer_details column order:
  // id, customer_id, first_name, last_name, customer_gst, bank_account_number,
  // qualiity, email, adddress, street, city, country, previous_zone,
  // current_zone, landline, mobile_num, alt_mobile, pan_no, adhar_number,
  // customer_type, created_at, updated_at, deleted_at, sub_ward_id, latitude,
  // longitude, sub_customer_type, remark, status, remarks, updated_by
  const rows = parseInsertTuples(sql, 'customer_details');
  let imported = 0;
  const ids = [];
  for (const r of rows) {
    const customer_id = r[1];
    if (!customer_id) continue;
    ids.push(customer_id);
    await pool.query(
      `INSERT INTO customers
        (customer_id, first_name, last_name, customer_gst, bank_account_number,
         email, address, street, city, country, landline, mobile_num, alt_mobile,
         pan_no, aadhar_number, customer_type, sub_customer_type, latitude,
         longitude, status, remark, updated_by, legacy_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       ON CONFLICT (customer_id) DO NOTHING`,
      [
        customer_id, r[2], r[3], r[4], r[5], r[7], r[8], r[9], r[10], r[11],
        r[14], r[15], r[16], r[17], r[18], r[19], r[26], r[24], r[25], r[28],
        r[27] || r[29], r[30], r[0] ? Number(r[0]) : null,
        cleanTimestamp(r[20]), cleanTimestamp(r[21]),
      ]
    );
    imported += 1;
  }
  return { imported, maxSuffix: maxNumericSuffix(ids, 'C') };
}

async function importSuppliers(sql) {
  // Legacy suplier_details column order:
  // id, suplier_id, supplier_firm_name, address, city, country, ward, zone,
  // contact_person_name, fax_num, landline, mobile, alt_number,
  // current_gst_info, pan_number, aadhar_number, account_number,
  // account_holder_name, IFSC, Branch, Bank_name, block, created_at,
  // updated_at, deleted_at
  const rows = parseInsertTuples(sql, 'suplier_details');
  let imported = 0;
  const ids = [];
  for (const r of rows) {
    const supplier_id = r[1];
    if (!supplier_id) continue;
    ids.push(supplier_id);
    await pool.query(
      `INSERT INTO suppliers
        (supplier_id, supplier_firm_name, address, city, country, ward, zone,
         contact_person_name, fax_num, landline, mobile, alt_number,
         current_gst_info, pan_number, aadhar_number, account_number,
         account_holder_name, ifsc, branch, bank_name, legacy_id,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (supplier_id) DO NOTHING`,
      [
        supplier_id, r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10],
        r[11], r[12], r[13], r[14], r[15], r[16], r[17], r[18], r[19], r[20],
        r[0] ? Number(r[0]) : null, cleanTimestamp(r[22]), cleanTimestamp(r[23]),
      ]
    );
    imported += 1;
  }
  return { imported, maxSuffix: maxNumericSuffix(ids, 'S') };
}

async function bumpCounter(name, atLeast) {
  await pool.query(
    `UPDATE id_counters SET value = GREATEST(value, $2) WHERE name = $1`,
    [name, atLeast]
  );
}

async function importProjects(sql, customerSet) {
  // Legacy customer_projects columns:
  // id, customer_id, user_id, project_id, created_at, updated_at, ward
  const rows = parseInsertTuples(sql, 'customer_projects');
  const seen = new Set();
  let imported = 0;
  let maxNum = 0;
  for (const r of rows) {
    const customerId = r[1];
    const projectId = r[3];
    if (!projectId || !customerId) continue;
    if (!customerSet.has(customerId)) continue; // FK: customer must exist
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    await pool.query(
      `INSERT INTO projects (project_id, customer_id, ward, created_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (project_id) DO NOTHING`,
      [projectId, customerId, r[6] || null, cleanTimestamp(r[4])]
    );
    const n = Number(projectId);
    if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
    imported += 1;
  }
  return { imported, projectSet: seen, maxNum };
}

async function importOrders(sql, customerSet, projectSet) {
  // Legacy customer_orders columns:
  // id, user_id, customer_id, order_id, created_at, updated_at, project_id, ...
  const rows = parseInsertTuples(sql, 'customer_orders');
  const seen = new Set();
  let imported = 0;
  let maxSuffix = 0;
  for (const r of rows) {
    const customerId = r[2];
    const orderId = r[3];
    const projectId = r[6];
    if (!orderId || !customerId) continue;
    if (!customerSet.has(customerId)) continue;
    if (seen.has(orderId)) continue;
    seen.add(orderId);
    await pool.query(
      `INSERT INTO orders (order_id, customer_id, project_id, status, created_at)
       VALUES ($1, $2, $3, 'completed', $4) ON CONFLICT (order_id) DO NOTHING`,
      [orderId, customerId, projectSet.has(projectId) ? projectId : null, cleanTimestamp(r[4])]
    );
    const m = String(orderId).match(/_O(\d+)$/);
    if (m) maxSuffix = Math.max(maxSuffix, Number(m[1]));
    imported += 1;
  }
  return { imported, maxSuffix };
}

// gst_tables: id, gst_number, state, created_at, updated_at, deleted_at, customer_id.
// Fold each customer's GST into their customer record (fills customer_gst when
// the customer_details row had none).
async function importCustomerGst(sql, customerSet) {
  const rows = parseInsertTuples(sql, 'gst_tables');
  let updated = 0;
  for (const r of rows) {
    const gst = r[1];
    const customerId = r[6];
    if (!gst || !customerId || !customerSet.has(customerId)) continue;
    const res = await pool.query(
      `UPDATE customers SET customer_gst = $1, updated_at = now()
        WHERE customer_id = $2 AND (customer_gst IS NULL OR customer_gst = '')`,
      [gst, customerId]
    );
    updated += res.rowCount;
  }
  return { updated };
}

// customer_other_numbers: id, number, customer_id, created_at, updated_at.
// Fold an extra contact number into alt_mobile when the customer has none.
async function importCustomerNumbers(sql, customerSet) {
  const rows = parseInsertTuples(sql, 'customer_other_numbers');
  let updated = 0;
  for (const r of rows) {
    const number = r[1];
    const customerId = r[2];
    if (!number || !customerId || !customerSet.has(customerId)) continue;
    const res = await pool.query(
      `UPDATE customers SET alt_mobile = $1, updated_at = now()
        WHERE customer_id = $2 AND (alt_mobile IS NULL OR alt_mobile = '')`,
      [number, customerId]
    );
    updated += res.rowCount;
  }
  return { updated };
}

async function main() {
  const customerPath = process.argv[2] || path.join(__dirname, '..', 'data', 'legacy', 'customer_db.sql');
  const supplierPath = process.argv[3] || path.join(__dirname, '..', 'data', 'legacy', 'suplier_db.sql');

  const customerSql = fs.readFileSync(customerPath, 'utf8');
  const supplierSql = fs.readFileSync(supplierPath, 'utf8');

  const cust = await importCustomers(customerSql);
  // eslint-disable-next-line no-console
  console.log(`✓ customers imported: ${cust.imported} (max C-suffix ${cust.maxSuffix})`);
  const sup = await importSuppliers(supplierSql);
  // eslint-disable-next-line no-console
  console.log(`✓ suppliers imported: ${sup.imported} (max S-suffix ${sup.maxSuffix})`);

  // Advance counters so new ids continue past the highest legacy value.
  await bumpCounter('customer', cust.maxSuffix);
  await bumpCounter('supplier', sup.maxSuffix);

  // Import old projects & orders (so an enquiry can reference an existing project).
  const custRows = await pool.query('SELECT customer_id FROM customers');
  const customerSet = new Set(custRows.rows.map((x) => x.customer_id));

  // Fold in extra customer detail kept in side tables (GST, other numbers).
  const gst = await importCustomerGst(customerSql, customerSet);
  const nums = await importCustomerNumbers(customerSql, customerSet);
  // eslint-disable-next-line no-console
  console.log(`✓ customer GST folded in: ${gst.updated}; extra numbers: ${nums.updated}`);

  const proj = await importProjects(customerSql, customerSet);
  // eslint-disable-next-line no-console
  console.log(`✓ projects imported: ${proj.imported} (max numeric ${proj.maxNum})`);
  const ord = await importOrders(customerSql, customerSet, proj.projectSet);
  // eslint-disable-next-line no-console
  console.log(`✓ orders imported: ${ord.imported} (max O-suffix ${ord.maxSuffix})`);
  await bumpCounter('project', proj.maxNum);
  await bumpCounter('order', ord.maxSuffix);

  // Invoice counter from any IN ids present in the customer dump.
  const invMatches = customerSql.match(/_IN(\d+)/g) || [];
  const maxInv = invMatches.reduce((m, s) => Math.max(m, Number(s.slice(3))), 0);
  await bumpCounter('invoice', maxInv);

  const { rows } = await pool.query('SELECT name, value FROM id_counters ORDER BY name');
  // eslint-disable-next-line no-console
  console.log('✓ counters now:', Object.fromEntries(rows.map((x) => [x.name, Number(x.value)])));

  await pool.end();
}

// Reusable pieces for the lighter "refresh details" script.
module.exports = { parseInsertTuples, importCustomerGst, importCustomerNumbers };

// Only run the full import when invoked directly (not when required).
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
