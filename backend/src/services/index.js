const { createProductService } = require('./product.service');
const { createConflictService } = require('./conflict.service');
const { createIdeaService } = require('./idea.service');
const { createPlanService } = require('./plan.service');
const { createSkinAnalysisService } = require('./skinAnalysis.service');
const { createImageUploadWorkflow } = require('./imageUpload.workflow');

const createDomainServices = ({ aiProvider, storageProvider, logger }) => {
  const imageUploadWorkflow = createImageUploadWorkflow({ storageProvider, logger });
  return {
    productService: createProductService({ aiProvider, storageProvider, logger, imageUploadWorkflow }),
    conflictService: createConflictService({ aiProvider, storageProvider }),
    ideaService: createIdeaService(),
    planService: createPlanService({ aiProvider }),
    skinAnalysisService: createSkinAnalysisService({ aiProvider, storageProvider, imageUploadWorkflow })
  };
};

module.exports = { createDomainServices };
