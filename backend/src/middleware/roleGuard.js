const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access forbidden. Admin role required.' });
  }
  next();
};

const requireAgent = (req, res, next) => {
  if (!req.user || (req.user.role !== 'agent' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access forbidden. Agent or Admin role required.' });
  }
  next();
};

const requireViewer = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'viewer')) {
    return res.status(403).json({ error: 'Access forbidden.' });
  }
  next();
};

module.exports = { requireAdmin, requireAgent, requireViewer };
