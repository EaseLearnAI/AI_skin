const express = require('express');
const Joi = require('joi');

const { createPlanController } = require('../controllers/plan.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { wrap, objectId, envelope } = require('./helpers');

const calendarDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value : helpers.error('any.invalid');
});
const timezone = Joi.string().max(100).custom((value, helpers) => {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return helpers.error('any.invalid'); }
});
const dayFields = { date: calendarDate.required(), timezone: timezone.required() };

const routine = Joi.object({
  step: Joi.number().integer().min(1),
  product: Joi.string().allow(''),
  reason: Joi.string().allow(''),
  done: Joi.boolean(),
  completed: Joi.boolean()
});

const createPlanRouter = ({ authService, planService }) => {
  const router = express.Router();
  const controller = createPlanController(planService);
  router.use(createProtect(authService));
  router.route('/')
    .post(validate(envelope({ body: Joi.object({
      requirement: Joi.string().allow('').max(2000),
      userAge: Joi.number().integer().min(13).max(120),
      age: Joi.number().integer().min(13).max(120),
      skinConcerns: Joi.array().items(Joi.string().max(100)).max(20),
      customRequirements: Joi.string().allow('').max(3000)
    }) })), wrap(controller.generate))
    .get(wrap(controller.list));
  router.route('/active')
    .get(wrap(controller.getActive))
    .put(validate(envelope({ body: Joi.object({ planId: objectId.allow(null).required() }) })), wrap(controller.setActive));
  router.get('/:id/daily', validate(envelope({
    params: Joi.object({ id: objectId.required() }), query: Joi.object(dayFields)
  })), wrap(controller.getDaily));
  router.put('/:id/daily/steps', validate(envelope({
    params: Joi.object({ id: objectId.required() }), body: Joi.object({ ...dayFields,
      period: Joi.string().valid('morning', 'evening').required(),
      step: Joi.number().integer().min(1).required(), completed: Joi.boolean().required()
    })
  })), wrap(controller.updateDailyStep));
  router.post('/custom' , validate(envelope({ body: Joi.object({
    name: Joi.string().trim().max(200).required(),
    morning: Joi.array().items(routine).required(),
    evening: Joi.array().items(routine).required(),
    recommendations: Joi.array().items(Joi.string().max(500)),
    tags: Joi.array().items(Joi.string().max(100)),
    notes: Joi.string().allow('').max(5000)
  }) })), wrap(controller.custom));
  router.patch('/:id/step', validate(envelope({
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
      period: Joi.string().valid('morning', 'evening').required(),
      step: Joi.number().integer().min(1).required(),
      completed: Joi.boolean().required()
    })
  })), wrap(controller.updateStep));
  router.route('/:id')
    .get(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get))
    .delete(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.remove));
  return router;
};

module.exports = { createPlanRouter };
