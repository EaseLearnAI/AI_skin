const express = require('express');
const Joi = require('joi');

const { createConflictController } = require('../controllers/conflict.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { wrap, objectId, envelope } = require('./helpers');

const createConflictRouter = ({ authService, conflictService }) => {
  const router = express.Router();
  const controller = createConflictController(conflictService);
  router.use(createProtect(authService));
  router.route('/')
    .post(validate(envelope({ body: Joi.object({
      productIds: Joi.array().items(objectId.required()).min(2).required()
    }) })), wrap(controller.analyze))
    .get(wrap(controller.list));
  router.get('/user/:userId', validate(envelope({ params: Joi.object({ userId: objectId.required() }) })), wrap(controller.summary));
  router.get('/detail/:id', validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get));
  router.route('/:id')
    .get(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get))
    .delete(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.remove));
  return router;
};

module.exports = { createConflictRouter };
