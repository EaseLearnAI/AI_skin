const { createProductService } = require('./product.service');
const { createConflictService } = require('./conflict.service');
const { createIdeaService } = require('./idea.service');
const { createPlanService } = require('./plan.service');
const { createSkinAnalysisService } = require('./skinAnalysis.service');

const createDomainServices = ({ aiProvider, storageProvider }) => ({
  productService: createProductService({ aiProvider, storageProvider }),
  conflictService: createConflictService({ aiProvider, storageProvider }),
  ideaService: createIdeaService(),
  planService: createPlanService({ aiProvider }),
  skinAnalysisService: createSkinAnalysisService({ aiProvider, storageProvider })
});

module.exports = { createDomainServices };
