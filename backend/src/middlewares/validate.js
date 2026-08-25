const { ApiError } = require('./error');

const validate = (schema) => (req, res, next) => {
  const result = schema.validate({
    body: req.body || {},
    params: req.params || {},
    query: req.query || {}
  }, { abortEarly: false, stripUnknown: true });
  if (result.error) {
    return next(new ApiError(
      400,
      '请求参数不正确',
      'VALIDATION_ERROR',
      result.error.details.map((item) => item.message)
    ));
  }
  req.body = result.value.body;
  Object.assign(req.params, result.value.params);
  req.validated = result.value;
  return next();
};

module.exports = { validate };
