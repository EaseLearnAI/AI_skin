const express = require('express');
const Joi = require('joi');

const { createSkinAnalysisController } = require('../controllers/skinAnalysis.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { createImageUpload } = require('../middlewares/upload');
const { wrap, objectId, envelope } = require('./helpers');

const createSkinAnalysisRouter = ({ authService, skinAnalysisService }) => {
  const router = express.Router();
  const controller = createSkinAnalysisController(skinAnalysisService);
  router.use(createProtect(authService));
  router.post('/analyze', createImageUpload('faceImage', 10 * 1024 * 1024), wrap(controller.analyze));
  router.get('/', validate(envelope({ query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10)
  }) })), wrap(controller.list));
  router.get('/stats', wrap(controller.stats));
  router.get('/latest', wrap(controller.latest));
  router.route('/:id')
    .get(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get))
    .delete(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.remove));
  return router;
};

module.exports = { createSkinAnalysisRouter };
