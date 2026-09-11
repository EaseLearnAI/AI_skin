const express = require('express');
const Joi = require('joi');
const { rateLimit } = require('express-rate-limit');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { createPaymentController } = require('../controllers/payment.controller');
const { ApiError } = require('../middlewares/error');

const createPaymentRouter = ({ authService, paymentService }) => {
  const router = express.Router();
  const controller = createPaymentController(paymentService);
  const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.post('/alipay/notify', (req, res, next) => {
    // Never strip or transform signed fields. Reject object/array injection before verification.
    if (!req.is('application/x-www-form-urlencoded') || !req.body ||
      Object.entries(req.body).some(([key, value]) => key.length > 128 || typeof value !== 'string') ||
      JSON.stringify(req.body).length > 65536) return next(new ApiError(400, '支付通知格式无效', 'PAYMENT_INVALID_SIGNATURE'));
    next();
  }, wrap(controller.notify));
  router.use(createProtect(authService));
  const limiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => String(req.user._id),
    handler: (req, res) => res.status(429).json({ success: false, message: '请求过于频繁，请稍后重试', code: 'RATE_LIMITED' }) });
  router.get('/catalog', wrap(controller.catalog));
  router.get('/membership', limiter, wrap(controller.membership));
  router.post('/orders', limiter, validate(Joi.object({ body: Joi.object({
    productId: Joi.string().valid('member_month', 'member_year').required(),
    idempotencyKey: Joi.string().pattern(/^[A-Za-z0-9_-]{8,128}$/).required()
  }).required(), params: Joi.object(), query: Joi.object() })), wrap(controller.createOrder));
  const idSchema = Joi.object({ body: Joi.object(), query: Joi.object(), params: Joi.object({ id: Joi.string().hex().length(24).required() }) });
  router.get('/orders/:id', validate(idSchema), wrap(controller.getOrder));
  router.post('/orders/:id/refresh', limiter, validate(idSchema), wrap(controller.refreshOrder));
  return router;
};
module.exports = { createPaymentRouter };
