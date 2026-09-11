const Joi = require('joi');

const reportText = (max) => Joi.string().trim().min(1).max(max)
  .pattern(/[\u0000-\u001f\u007f\uFFFD]|\\(?:[nrt]|u[\da-fA-F]{4})|```|<\/?[A-Za-z][^>]*>|^\s*[\[{]/u, { invert: true });

const ingredientReadingItems = () => Joi.array().min(1).max(3)
  .items(reportText(55).pattern(/^[^：:]{1,12}：.{1,42}$/u));

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
    efficacyAnalysis: ingredientReadingItems().required(),
    potentialRisks: ingredientReadingItems().required(),
    recommendations: ingredientReadingItems().required(),
    overallRating: Joi.number().min(0).max(5).required(),
    summary: reportText(60).required()
  }),
  conflict: Joi.object({
    riskScore: Joi.number().min(0).max(5).allow(null).required(),
    summary: reportText(60).required(),
    productPairs: Joi.array().min(1).items(Joi.object({
      productIds: Joi.array().length(2).unique().items(Joi.string().required()).required(),
      status: Joi.string().valid('compatible', 'caution', 'avoid', 'unknown').required(),
      explanation: reportText(80).required()
    })).required()
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
    otherIssues: Joi.object({
      description: Joi.string().allow(''),
      redness: Joi.object({ exists: Joi.boolean(), severity: Joi.string().allow(''),
        distribution: Joi.array().items(Joi.string()), description: Joi.string().allow('') }),
      hyperpigmentation: Joi.object({ exists: Joi.boolean(), severity: Joi.string().allow(''),
        types: Joi.array().items(Joi.string()), distribution: Joi.array().items(Joi.string()), description: Joi.string().allow('') }),
      fineLines: Joi.object({ exists: Joi.boolean(), severity: Joi.string().allow(''),
        distribution: Joi.array().items(Joi.string()), description: Joi.string().allow('') }),
      sensitivity: Joi.object({ exists: Joi.boolean(), severity: Joi.string().allow(''),
        signs: Joi.array().items(Joi.string()), description: Joi.string().allow('') }),
      skinToneEvenness: Joi.object({ score: Joi.number().integer(), description: Joi.string().allow('') }),
      observations: Joi.array().items(Joi.object({ category: Joi.string().allow('').required(),
        details: Joi.array().items(Joi.string().allow('')).required() }))
    }).default({}),
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
