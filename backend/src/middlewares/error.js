class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_ERROR', details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    code: 'ROUTE_NOT_FOUND',
    requestId: req.id
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  req.app.locals.logger?.error({
    event: 'request_error',
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode,
    code: err.code || 'INTERNAL_ERROR',
    errorName: err.name
  });
  const payload = {
    success: false,
    message: statusCode >= 500 && !err.isOperational ? '服务器内部错误' : err.message,
    code: err.code || 'INTERNAL_ERROR',
    requestId: req.id
  };

  if (err.details !== undefined && statusCode < 500) {
    payload.details = err.details;
  }
  res.status(statusCode).json(payload);
};

module.exports = { ApiError, notFound, errorHandler };
