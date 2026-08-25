const express = require('express');
const Joi = require('joi');
const { rateLimit } = require('express-rate-limit');

const { createUserController } = require('../controllers/user.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');

const body = (schema) => Joi.object({
  body: schema.required(),
  params: Joi.object().default({}),
  query: Joi.object().default({})
});
const appleSchema = body(Joi.object({
  identityToken: Joi.string().required(),
  authorizationCode: Joi.string().required(),
  rawNonce: Joi.string().min(8).required(),
  givenName: Joi.string().trim().max(100),
  familyName: Joi.string().trim().max(100)
}));

const createUserRouter = ({ authService }) => {
  const router = express.Router();
  const controller = createUserController(authService);
  const protect = createProtect(authService);
  const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMITED',
      requestId: req.id
    })
  });

  router.post('/register', authLimiter, validate(body(Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required(),
    password: Joi.string().min(6).max(128).required(),
    gender: Joi.string().valid('male', 'female').required(),
    email: Joi.any().strip()
  }))), wrap(controller.register));
  router.post('/login', authLimiter, validate(body(Joi.object({
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required(),
    password: Joi.string().required(),
    email: Joi.any().strip()
  }))), wrap(controller.login));
  router.post('/apple', authLimiter, validate(appleSchema), wrap(controller.apple));
  router.post('/password-reset/request', authLimiter, validate(body(Joi.object({
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required()
  }))), wrap(controller.requestPasswordReset));
  router.post('/password-reset/confirm', authLimiter, validate(body(Joi.object({
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required(),
    verificationCode: Joi.string().pattern(/^\d{6}$/).required(),
    newPassword: Joi.string().min(6).max(128).required()
  }))), wrap(controller.confirmPasswordReset));

  router.use(protect);
  router.post('/apple/link', validate(appleSchema), wrap(controller.linkApple));
  router.get('/me', wrap(controller.getMe));
  router.patch('/update-username', validate(body(Joi.object({ name: Joi.string().trim().min(1).max(100).required() }))), wrap(controller.updateUsername));
  router.patch('/update-gender', validate(body(Joi.object({ gender: Joi.string().valid('male', 'female').required() }))), wrap(controller.updateGender));
  router.patch('/update-age', validate(body(Joi.object({ age: Joi.number().integer().min(13).max(120).required() }))), wrap(controller.updateAge));
  router.patch('/update-menstrual-cycle', validate(body(Joi.object({
    isInCycle: Joi.boolean(),
    cycleDay: Joi.number().integer().min(1).max(40).allow(null),
    cycleLength: Joi.number().integer().min(21).max(40)
  }).min(1))), wrap(controller.updateMenstrualCycle));
  router.get('/stats', wrap(controller.stats));
  router.post('/logout', wrap(controller.logout));
  router.delete('/delete-account', wrap(controller.deleteAccount));
  return router;
};

module.exports = { createUserRouter };
