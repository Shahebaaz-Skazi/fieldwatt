const { ZodError } = require('zod');
const db = require('../db');

module.exports = async (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  const route = req.originalUrl || req.url;
  const payload = JSON.stringify(req.body).substring(0, 500);

  let statusCode = err.status || 500;
  let message = err.message || 'Internal Server Error';
  let details = null;

  if (err instanceof ZodError) {
    const detailsList = err.errors.map(e => `${e.path.join('.') || 'field'}: ${e.message}`);
    statusCode = 400;
    message = `Validation failed: ${detailsList.join(', ')}`;
    details = err.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message
    }));
  } else if (err.code === '23505' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
    statusCode = 400;
    const msg = err.message || '';
    if (msg.includes('agents.username')) {
      message = 'An agent with this username already exists.';
    } else if (msg.includes('agents.phone')) {
      message = 'An agent with this phone number already exists.';
    } else {
      message = 'A record with this username, phone number, or email already exists.';
    }
  }

  try {
    await db.query(
      'INSERT INTO error_logs (message, stack, route, payload) VALUES (?, ?, ?, ?)',
      [message, err.stack || '', route, payload]
    );
  } catch (dbErr) {
    console.error('Failed to log error to DB:', dbErr);
  }

  res.status(statusCode).json({
    error: message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
