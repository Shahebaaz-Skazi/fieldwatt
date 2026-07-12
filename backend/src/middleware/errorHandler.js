const { ZodError } = require('zod');

module.exports = (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Handle postgres unique constraint errors
  if (err.code === '23505') {
    return res.status(400).json({ error: 'Duplicate key value violates unique constraint.' });
  }

  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
