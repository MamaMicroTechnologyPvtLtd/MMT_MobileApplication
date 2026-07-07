// Razorpay payment-gateway integration.
//
// When RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set, real orders are created
// and payment signatures verified against Razorpay. Without keys the module runs
// in "mock" mode so the pay flow is fully testable in development.

const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function configured() {
  return !!(KEY_ID && KEY_SECRET);
}

// Create a Razorpay order for an amount in INR (rupees). Returns the order JSON.
async function createOrder(amountInr, receipt) {
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(Number(amountInr) * 100), // paise
      currency: 'INR',
      receipt,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Razorpay order failed ${res.status}: ${detail.slice(0, 160)}`);
  }
  return res.json();
}

// Verify the checkout callback signature: HMAC_SHA256(order_id|payment_id, secret).
function verifySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false;
  }
}

module.exports = { configured, createOrder, verifySignature, KEY_ID };
