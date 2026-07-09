// Push notifications via Expo's push service. Best-effort: failures never break
// the main request. Notification rows are still written by the routes; these
// helpers add the device push on top.

const { query } = require('../config/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(tokens, { title, body, data }) {
  const valid = (tokens || []).filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken')
  );
  if (valid.length === 0) return;
  const messages = valid.map((to) => ({ to, sound: 'default', title, body, data: data || {} }));
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Expo push failed:', err.message);
  }
}

async function tokensFor(whereSql, params) {
  const { rows } = await query(
    `SELECT push_token FROM users WHERE push_token IS NOT NULL AND ${whereSql}`,
    params
  );
  return rows.map((r) => r.push_token);
}

// Fire-and-forget push helpers (do not await in the request path if you want).
async function pushCustomer(customerId, payload) {
  if (!customerId) return;
  await sendExpoPush(await tokensFor('customer_id = $1', [customerId]), payload);
}
async function pushSupplier(supplierId, payload) {
  if (!supplierId) return;
  await sendExpoPush(await tokensFor('supplier_id = $1', [supplierId]), payload);
}
async function pushInternal(payload) {
  await sendExpoPush(await tokensFor("role = 'internal'", []), payload);
}
async function pushUser(userId, payload) {
  if (!userId) return;
  await sendExpoPush(await tokensFor('id = $1', [userId]), payload);
}

module.exports = { sendExpoPush, pushCustomer, pushSupplier, pushInternal, pushUser };
