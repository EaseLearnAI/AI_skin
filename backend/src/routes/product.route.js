const express = require('express');
const Joi = require('joi');

const { createProductController } = require('../controllers/product.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { createImageUpload } = require('../middlewares/upload');
const { wrap, objectId, envelope } = require('./helpers');

const createProductRouter = ({ authService, productService }) => {
  const router = express.Router();
  const controller = createProductController(productService);
  router.use(createProtect(authService));

  router.route('/')
    .post(validate(envelope({ body: Joi.object({
      name: Joi.string().trim().max(200),
      description: Joi.string().allow('').max(5000),
      label: Joi.string().allow('').max(100),
      openingDate: Joi.date().iso().allow(null),
      openingStatus: Joi.string().valid('unknown', 'unopened', 'opened')
    }) })), wrap(controller.create))
    .get(validate(envelope({ query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(10)
    }) })), wrap(controller.list));

  router.get('/user/:userId/label/:label', validate(envelope({ params: Joi.object({
    userId: objectId.required(), label: Joi.string().required()
  }) })), wrap(controller.listByLabel));
  router.get('/user/:userId', validate(envelope({ params: Joi.object({ userId: objectId.required() }) })), wrap(controller.listCompatibility));
  router.post('/:id/upload-image', validate(envelope({ params: Joi.object({ id: objectId.required() }) })), createImageUpload('productImage', 5 * 1024 * 1024), wrap(controller.uploadImage));
  router.post('/:id/extract-ingredients', validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.extractIngredients));
  router.post('/:id/analyze-ingredients', validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.analyzeIngredients));
  router.get('/:id/ingredient-analysis', validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.getIngredientAnalysis));
  router.route('/:id')
    .get(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get))
    .put(validate(envelope({
      params: Joi.object({ id: objectId.required() }),
      body: Joi.object({
        name: Joi.string().trim().max(200),
        description: Joi.string().allow('').max(5000),
        label: Joi.string().allow('').max(100),
        openingDate: Joi.date().iso().allow(null),
      openingStatus: Joi.string().valid('unknown', 'unopened', 'opened')
      }).min(1)
    })), wrap(controller.update))
    .delete(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.remove));
  return router;
};

module.exports = { createProductRouter };
