const Joi = require('joi');

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const objectId = Joi.string().hex().length(24);
const envelope = ({ body = Joi.object().default({}), params = Joi.object().default({}), query = Joi.object().default({}) }) => Joi.object({
  body: body.required(),
  params: params.required(),
  query: query.required()
});

module.exports = { wrap, objectId, envelope };
