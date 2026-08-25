const express = require('express');
const Joi = require('joi');

const { createIdeaController } = require('../controllers/idea.controller');
const { createProtect } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { wrap, objectId, envelope } = require('./helpers');

const createIdeaRouter = ({ authService, ideaService }) => {
  const router = express.Router();
  const controller = createIdeaController(ideaService);
  router.use(createProtect(authService));
  router.route('/')
    .post(validate(envelope({ body: Joi.object({
      title: Joi.string().trim().max(200).required(),
      content: Joi.string().trim().max(10000).required(),
      category: Joi.string().valid('功能建议', '问题反馈', '界面优化', '产品需求', '其他')
    }) })), wrap(controller.create))
    .get(wrap(controller.list));
  router.route('/:id')
    .get(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.get))
    .put(validate(envelope({
      params: Joi.object({ id: objectId.required() }),
      body: Joi.object({
        title: Joi.string().trim().max(200),
        content: Joi.string().trim().max(10000),
        category: Joi.string().valid('功能建议', '问题反馈', '界面优化', '产品需求', '其他')
      }).min(1)
    })), wrap(controller.update))
    .delete(validate(envelope({ params: Joi.object({ id: objectId.required() }) })), wrap(controller.remove));
  return router;
};

module.exports = { createIdeaRouter };
