// WhatsApp delivery for supplier requirements.
//
// Two modes:
//  1. Deep links (wa.me): always available — the internal member taps to open a
//     pre-filled WhatsApp chat per supplier. No setup, works today.
//  2. Cloud API: if WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set, messages are
//     sent server-side (true one-click for all suppliers).

const DEFAULT_CC = process.env.WHATSAPP_DEFAULT_CC || '91'; // India

// Normalise an arbitrary phone string to international digits (no +).
function normalizePhone(raw, cc = DEFAULT_CC) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return cc + d;                 // local 10-digit
  if (d.length === 11 && d.startsWith('0')) return cc + d.slice(1);
  return d;                                           // assume already has CC
}

function buildWaLink(phone, message) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

function cloudConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

async function sendCloud(phone, message) {
  const p = normalizePhone(phone);
  if (!p) throw new Error('No valid phone number');
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: p,
      type: 'text',
      text: { body: message },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`WhatsApp Cloud API ${res.status}: ${detail.slice(0, 160)}`);
  }
  return res.json();
}

// Compose the requirement message sent to a supplier.
function requirementMessage({ orderId, requirement, quantity, priceRange, note }) {
  const lines = [
    `*MMT — Requirement ${orderId}*`,
    requirement || '',
    quantity ? `Quantity: ${quantity}` : '',
    priceRange ? `Price range: ${priceRange}` : '',
    note ? `Note: ${note}` : '',
    '',
    'Please reply with your quotation (price, duration, and any conditions).',
  ];
  return lines.filter(Boolean).join('\n');
}

module.exports = {
  normalizePhone, buildWaLink, cloudConfigured, sendCloud, requirementMessage,
};
