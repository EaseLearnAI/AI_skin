const { randomUUID } = require('crypto');

const requestId = (req, res, next) => {
  const id = req.get('X-Request-ID') || randomUUID();
  req.id = id;
  res.set('X-Request-ID', id);
  next();
};

module.exports = { requestId };
