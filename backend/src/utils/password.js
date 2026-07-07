const crypto = require('crypto');

// Human-friendly alphabet: no look-alikes (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a short, shareable password for a customer/supplier login that the
 * internal member hands over. Not meant to be memorable — it's a first
 * credential the account holder can use immediately.
 */
function generatePassword(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

module.exports = { generatePassword };
