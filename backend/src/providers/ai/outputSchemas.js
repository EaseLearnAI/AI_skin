const Joi = require('joi');

const routine = Joi.object({
  step: Joi.number().integer().min(1).required(),
  product: Joi.string().required(),
  reason: Joi.string().required()
});
const risk = Joi.object({
  level: Joi.string().valid('低', '中', '高').required(),
  percentage: Joi.number().min(0).max(100).required()
});

const schemas = {
  ocr: Joi.object({
    产品名称: Joi.string().allow('').required(),
    产品成分: Joi.array().items(Joi.string()).required()
  }),
  ingredients: Joi.object({
    safetyIndex: Joi.number().min(0).max(100).required(),
    efficacyScore: Joi.number().min(0).max(5).required(),
    activeIngredients: Joi.number().integer().min(0).required(),
    acneRisk: risk.required(),
    irritationRisk: risk.required(),
    allergyRisk: risk.required(),
    efficacyAnalysis: Joi.array().items(Joi.string()).required(),
    potentialRisks: Joi.array().items(Joi.string()).required(),
    recommendations: Joi.array().items(Joi.string()).required(),
    overallRating: Joi.number().min(0).max(5).required(),
    summary: Joi.string().min(1).required()
  }),
  conflict: Joi.object({
    conflicts: Joi.array().items(Joi.object({
      components: Joi.array().items(Joi.string()).required(),
      severity: Joi.string().valid('高', '中', '低').required(),
      description: Joi.string().required(),
      effects: Joi.array().items(Joi.string()).default([])
    })).required(),
    safeCombo: Joi.array().items(Joi.object({
      components: Joi.array().items(Joi.string()).required(),
      description: Joi.string().required()
    })).required(),
    recommendations: Joi.object({
      productPairings: Joi.object({
        cannotUseTogether: Joi.array().items(Joi.object({ products: Joi.array().items(Joi.string()), reason: Joi.string().allow('') })).required(),
        canUseTogether: Joi.array().items(Joi.object({ products: Joi.array().items(Joi.string()), reason: Joi.string().allow('') })).required()
      }).required(),
      routines: Joi.object({
        morning: Joi.array().items(Joi.string()).required(),
        evening: Joi.array().items(Joi.string()).required()
      }).required()
    }).required()
  }),
  plan: Joi.object({
    name: Joi.string().min(1).required(),
    morning: Joi.array().items(routine).required(),
    evening: Joi.array().items(routine).required(),
    recommendations: Joi.array().items(Joi.string()).required(),
    skinAnalysisSummary: Joi.string().allow('').required()
  }),
  skin: Joi.object({
    skinType: Joi.object({
      type: Joi.string().valid('油性皮肤', '干性皮肤', '中性皮肤', '混合性皮肤').required(),
      subtype: Joi.string().valid('混油性', '混干性', '正常').required(),
      basis: Joi.string().min(1).required()
    }).required(),
    blackheads: Joi.object({
      exists: Joi.boolean().required(),
      severity: Joi.string().valid('无', '少量', '中度', '大量').required(),
      distribution: Joi.array().items(Joi.string()).required()
    }).required(),
    acne: Joi.object({
      exists: Joi.boolean().required(),
      count: Joi.string().valid('无', '少量', '中度', '大量').required(),
      types: Joi.array().items(Joi.string()).required(),
      activity: Joi.string().valid('不活跃', '轻度活跃', '中度活跃', '高度活跃').required(),
      distribution: Joi.array().items(Joi.string()).required()
    }).required(),
    pores: Joi.object({
      enlarged: Joi.boolean().required(),
      severity: Joi.string().valid('正常', '轻度', '中度', '严重').required(),
      distribution: Joi.array().items(Joi.string()).required()
    }).required(),
    otherIssues: Joi.object().unknown(true).default({}),
    overallAssessment: Joi.object({
      healthScore: Joi.number().min(0).max(100).required(),
      summary: Joi.string().min(1).required(),
      recommendations: Joi.array().items(Joi.string()).required(),
      skinCondition: Joi.string().valid('优秀', '良好', '一般', '需要改善', '需要专业护理').required()
    }).required(),
    moisture: Joi.number().min(0).max(100),
    glossiness: Joi.number().min(0).max(100),
    elasticity: Joi.number().min(0).max(100),
    problemAreaScore: Joi.number().min(0).max(100)
  })
};

module.exports = { schemas };
