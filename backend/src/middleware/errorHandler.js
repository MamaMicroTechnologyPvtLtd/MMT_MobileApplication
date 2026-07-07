// Centralised async wrapper + error handler.

/** Wrap an async route handler so thrown errors reach the error middleware. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);

  // Postgres unique-violation → 409
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate value', detail: err.detail });
  }
  // Postgres foreign-key violation → 400
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist', detail: err.detail });
  }

  const status = err.status || 500;
  return res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = { asyncHandler, errorHandler };
