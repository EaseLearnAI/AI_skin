const express = require('express');
const { createUserRouter } = require('./user.route');
const { createProductRouter } = require('./product.route');
const { createConflictRouter } = require('./conflict.route');
const { createIdeaRouter } = require('./idea.route');
const { createPlanRouter } = require('./plan.route');
const { createSkinAnalysisRouter } = require('./skinAnalysis.route');

const createApiRouter = ({
  authService,
  productService,
  conflictService,
  ideaService,
  planService,
  skinAnalysisService
}) => {
  const router = express.Router();
  router.use('/users', createUserRouter({ authService }));
  if (productService) router.use('/products', createProductRouter({ authService, productService }));
  if (conflictService) router.use('/conflicts', createConflictRouter({ authService, conflictService }));
  if (ideaService) router.use('/ideas', createIdeaRouter({ authService, ideaService }));
  if (planService) router.use('/plans', createPlanRouter({ authService, planService }));
  if (skinAnalysisService) router.use('/skin-analysis', createSkinAnalysisRouter({ authService, skinAnalysisService }));
  return router;
};

module.exports = { createApiRouter };
