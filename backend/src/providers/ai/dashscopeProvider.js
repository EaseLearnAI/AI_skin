const axios = require('axios');

const { ApiError } = require('../../middlewares/error');
const { schemas } = require('./outputSchemas');
const {
  productOcrPrompt,
  ingredientPrompt,
  conflictPrompt,
  planPrompt,
  skinPrompt
} = require('../../prompts');

const silentLogger = { info: () => undefined, error: () => undefined };

const normalizeOcrOutput = (value) => {
  if (!Array.isArray(value?.产品成分)) return value;
  const ingredients = value.产品成分.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item.成分 !== 'string') return [item];
    return item.成分.split(/[、，]/).map((ingredient) => ingredient.trim()).filter(Boolean);
  });
  return { ...value, 产品成分: ingredients };
};

const normalizeLevel = (level) => {
  const levels = { low: '低', medium: '中', high: '高' };
  return typeof level === 'string' ? (levels[level.toLowerCase()] || level) : level;
};

const normalizeRiskLevel = (risk) => {
  if (!risk || typeof risk !== 'object') return risk;
  return { ...risk, level: normalizeLevel(risk.level) };
};

const normalizeIngredientOutput = (value) => {
  const analysis = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return value;
  const asArray = (field) => (typeof field === 'string' ? [field] : field);
  return {
    ...analysis,
    activeIngredients: Array.isArray(analysis.activeIngredients)
      ? analysis.activeIngredients.length
      : analysis.activeIngredients,
    acneRisk: normalizeRiskLevel(analysis.acneRisk),
    irritationRisk: normalizeRiskLevel(analysis.irritationRisk),
    allergyRisk: normalizeRiskLevel(analysis.allergyRisk),
    efficacyAnalysis: asArray(analysis.efficacyAnalysis),
    potentialRisks: asArray(analysis.potentialRisks),
    recommendations: asArray(analysis.recommendations)
  };
};

const normalizeConflictOutput = (value) => {
  if (!value || typeof value !== 'object') return value;
  const pairings = value.recommendations?.productPairings;
  const routines = value.recommendations?.routines;
  const normalizePairing = (pairing) => {
    if (typeof pairing !== 'string') return pairing;
    return {
      products: pairing.split(/\s*\+\s*/).map((product) => product.trim()).filter(Boolean),
      reason: ''
    };
  };
  const normalizeRoutine = (routine) => (
    typeof routine === 'string'
      ? routine.split(/\s*(?:->|→)\s*/).map((step) => step.trim()).filter(Boolean)
      : routine
  );
  return {
    ...value,
    conflicts: Array.isArray(value.conflicts)
      ? value.conflicts.map((conflict) => ({
        ...conflict,
        severity: normalizeLevel(conflict.severity),
        effects: typeof conflict.effects === 'string' ? [conflict.effects] : conflict.effects
      }))
      : value.conflicts,
    recommendations: value.recommendations && {
      ...value.recommendations,
      productPairings: pairings && {
        ...pairings,
        cannotUseTogether: Array.isArray(pairings.cannotUseTogether)
          ? pairings.cannotUseTogether.map(normalizePairing)
          : pairings.cannotUseTogether,
        canUseTogether: Array.isArray(pairings.canUseTogether)
          ? pairings.canUseTogether.map(normalizePairing)
          : pairings.canUseTogether
      },
      routines: routines && {
        ...routines,
        morning: normalizeRoutine(routines.morning),
        evening: normalizeRoutine(routines.evening)
      }
    }
  };
};

const normalizePlanOutput = (value) => {
  const plan = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return value;
  return {
    ...plan,
    skinAnalysisSummary: plan.skinAnalysisSummary
      && typeof plan.skinAnalysisSummary === 'object'
      ? JSON.stringify(plan.skinAnalysisSummary)
      : plan.skinAnalysisSummary
  };
};

const normalizeSkinOutput = (value) => {
  if (!value || typeof value !== 'object') return value;
  const distribution = (field) => (
    typeof field === 'string'
      ? field.split(/[、，]/).map((area) => area.trim()).filter(Boolean)
      : field
  );
  const subtypes = { 偏干: '混干性', 偏油: '混油性', 中性: '正常' };
  const normalizeActivity = (activity) => (
    typeof activity === 'string' && activity.startsWith('无活动') ? '不活跃' : activity
  );
  return {
    ...value,
    skinType: value.skinType && {
      ...value.skinType,
      subtype: subtypes[value.skinType.subtype] || value.skinType.subtype
    },
    blackheads: value.blackheads && {
      ...value.blackheads,
      distribution: distribution(value.blackheads.distribution)
    },
    acne: value.acne && {
      ...value.acne,
      count: value.acne.count === 0 ? '无' : value.acne.count,
      activity: value.acne.activity === '无' ? '不活跃' : normalizeActivity(value.acne.activity),
      distribution: distribution(value.acne.distribution)
    },
    pores: value.pores && {
      ...value.pores,
      severity: value.pores.severity === '轻微' ? '轻度' : value.pores.severity,
      distribution: distribution(value.pores.distribution)
    },
    otherIssues: typeof value.otherIssues === 'string'
      ? { description: value.otherIssues }
      : Array.isArray(value.otherIssues)
        ? (value.otherIssues.length ? { items: value.otherIssues } : {})
        : value.otherIssues
  };
};

const createDashscopeProvider = ({ config, httpClient = axios, logger = silentLogger }) => {
  const call = async ({ model, messages, schema, normalize = (value) => value }) => {
    const startedAt = Date.now();
    let status = 'failed';
    try {
      let response;
      try {
        response = await httpClient.post(`${config.baseURL}/chat/completions`, {
          model,
          messages,
          response_format: { type: 'json_object' }
        }, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          timeout: config.timeoutMs
        });
      } catch (error) {
        throw new ApiError(error.code === 'ECONNABORTED' ? 504 : 502, 'AI 服务暂时不可用', 'AI_UPSTREAM_ERROR');
      }
      const content = response.data?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new ApiError(502, 'AI 返回结果格式不正确', 'AI_OUTPUT_INVALID');
      }
      const validated = schema.validate(normalize(parsed), { abortEarly: false, allowUnknown: false, stripUnknown: false });
      if (validated.error) {
        logger.error?.({
          event: 'ai_output_invalid',
          provider: 'dashscope',
          model,
          validationErrors: validated.error.details.map((detail) => ({
            path: detail.path.join('.'),
            type: detail.type,
            ...(detail.type === 'any.only' && typeof detail.context?.value === 'string'
              ? { value: detail.context.value.slice(0, 80) }
              : {})
          }))
        });
        throw new ApiError(502, 'AI 返回结果字段不完整', 'AI_OUTPUT_INVALID');
      }
      status = 'succeeded';
      return { value: validated.value, rawContent: content, processingTime: Date.now() - startedAt };
    } finally {
      logger.info({
        event: 'ai_call',
        provider: 'dashscope',
        model,
        status,
        durationMs: Date.now() - startedAt
      });
    }
  };

  return {
    async extractProductInfo({ imageUrl }) {
      const result = await call({
        model: config.ocrModel,
        schema: schemas.ocr,
        normalize: normalizeOcrOutput,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: productOcrPrompt() },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }]
      });
      return {
        productName: result.value.产品名称,
        ingredients: result.value.产品成分,
        rawContent: result.rawContent
      };
    },
    async analyzeIngredients(input) {
      const result = await call({
        model: config.textModel,
        schema: schemas.ingredients,
        normalize: normalizeIngredientOutput,
        messages: [{ role: 'user', content: ingredientPrompt(input) }]
      });
      return result.value;
    },
    async analyzeConflict(input) {
      const result = await call({
        model: config.textModel,
        schema: schemas.conflict,
        normalize: normalizeConflictOutput,
        messages: [{ role: 'user', content: conflictPrompt(input) }]
      });
      return result.value;
    },
    async generatePlan(input) {
      const result = await call({
        model: config.textModel,
        schema: schemas.plan,
        normalize: normalizePlanOutput,
        messages: [{ role: 'user', content: planPrompt(input) }]
      });
      return result.value;
    },
    async analyzeSkin({ imageUrl }) {
      const result = await call({
        model: config.visionModel,
        schema: schemas.skin,
        normalize: normalizeSkinOutput,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: skinPrompt() }
          ]
        }]
      });
      return {
        data: result.value,
        rawContent: result.rawContent,
        processingTime: result.processingTime,
        model: config.visionModel,
        promptVersion: 'skin-v1',
        schemaVersion: 'skin-v1'
      };
    }
  };
};

module.exports = { createDashscopeProvider };
