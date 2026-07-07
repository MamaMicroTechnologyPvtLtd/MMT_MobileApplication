// ============================================================================
// ID generation — continues the legacy series atomically.
//
// The region prefix (state_countrycode_zone) is preserved exactly as it was in
// the old software. Only the numeric suffix advances. Order/invoice/delivery
// ids additionally embed the 4-digit creation year, while the numeric counter
// itself is GLOBAL across years (matching the legacy data, e.g. O5423 spans
// 2018–2024).
//
// All generators use the same id_counters row with `UPDATE ... RETURNING` so
// concurrent requests can never receive a duplicate number.
// ============================================================================

const REGION_PREFIX = 'MH_91_Z1';

/**
 * Atomically increment a counter and return its new value.
 * Must be called with a client that is inside a transaction when the caller
 * needs the generated id and the dependent insert to be atomic.
 */
async function nextCounter(client, name) {
  const { rows } = await client.query(
    `UPDATE id_counters SET value = value + 1 WHERE name = $1 RETURNING value`,
    [name]
  );
  if (rows.length === 0) {
    throw new Error(`id_counters row "${name}" is missing — run npm run db:setup`);
  }
  return Number(rows[0].value);
}

async function nextCustomerId(client) {
  const n = await nextCounter(client, 'customer');
  return `${REGION_PREFIX}_C${n}`;
}

async function nextSupplierId(client) {
  const n = await nextCounter(client, 'supplier');
  return `${REGION_PREFIX}_S${n}`;
}

async function nextProjectId(client) {
  const n = await nextCounter(client, 'project');
  return String(n); // projects are plain numeric strings in the legacy data
}

async function nextOrderId(client, year = new Date().getFullYear()) {
  const n = await nextCounter(client, 'order');
  return `${REGION_PREFIX}_${year}_O${n}`;
}

async function nextInvoiceId(client, year = new Date().getFullYear()) {
  const n = await nextCounter(client, 'invoice');
  return `${REGION_PREFIX}_${year}_IN${n}`;
}

async function nextDeliveryId(client, year = new Date().getFullYear()) {
  const n = await nextCounter(client, 'delivery');
  return `${REGION_PREFIX}_${year}_DLV${n}`;
}

async function nextEnquiryId(client, year = new Date().getFullYear()) {
  const n = await nextCounter(client, 'enquiry');
  return `${REGION_PREFIX}_${year}_E${n}`;
}

async function nextQuotationId(client, year = new Date().getFullYear()) {
  const n = await nextCounter(client, 'quotation');
  return `${REGION_PREFIX}_${year}_Q${n}`;
}

module.exports = {
  REGION_PREFIX,
  nextCounter,
  nextCustomerId,
  nextSupplierId,
  nextProjectId,
  nextOrderId,
  nextInvoiceId,
  nextDeliveryId,
  nextEnquiryId,
  nextQuotationId,
};
