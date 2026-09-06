const { ZodError } = require('zod');

module.exports = (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  if (err instanceof ZodError) {
    const detailsList = err.errors.map(e => `${e.path.join('.') || 'field'}: ${e.message}`);
    return res.status(400).json({
      error: `Validation failed: ${detailsList.join(', ')}`,
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Handle unique constraint errors (Postgres & SQLite/D1)
  if (err.code === '23505' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
    const msg = err.message || '';
    if (msg.includes('agents.username')) {
      return res.status(400).json({ error: 'An agent with this username already exists.' });
    }
    if (msg.includes('agents.phone')) {
      return res.status(400).json({ error: 'An agent with this phone number already exists.' });
    }
    return res.status(400).json({ error: 'A record with this username, phone number, or email already exists.' });
  }

  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
