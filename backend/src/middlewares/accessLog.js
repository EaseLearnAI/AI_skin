const createAccessLog = (logger) => (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    logger.info({
      event: 'http_request',
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6
    });
  });
  next();
};

module.exports = { createAccessLog };
