const { normalizeSkinOtherIssues } = require('../../utils/skinOtherIssues');

// OCR commonly confuses capital I with 1/l in the five-digit Color Index notation.
const normalizeOcrIngredient = (value) => value.trim().replace(/^C\s*[Il1]\s*(\d{5})$/, 'CI$1');

const normalizeOcrOutput = (value) => {
  if (!Array.isArray(value?.产品成分)) return value;
  const ingredients = value.产品成分.flatMap((item) => {
    if (typeof item === 'string') return item.split(/[、，]/).map(normalizeOcrIngredient).filter(Boolean);
    if (!item || typeof item.成分 !== 'string') return [item];
    return item.成分.split(/[、，]/).map(normalizeOcrIngredient).filter(Boolean);
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
  const readingItems = (field) => {
    const items = asArray(field);
    if (!Array.isArray(items)) return items;
    return items.map((item) => typeof item === 'string'
      ? item.trim().replace(/^([^：:\n]{1,12}):\s*/, '$1：') : item);
  };
  return {
    ...analysis,
    activeIngredients: Array.isArray(analysis.activeIngredients)
      ? analysis.activeIngredients.length
      : analysis.activeIngredients,
    acneRisk: normalizeRiskLevel(analysis.acneRisk),
    irritationRisk: normalizeRiskLevel(analysis.irritationRisk),
    allergyRisk: normalizeRiskLevel(analysis.allergyRisk),
    efficacyAnalysis: readingItems(analysis.efficacyAnalysis),
    potentialRisks: readingItems(analysis.potentialRisks),
    recommendations: readingItems(analysis.recommendations)
  };
};

// Only canonicalize known JSON keys; never flatten text or invent scores/advice.
const conflictKeys = Object.fromEntries([
  'riskScore', 'summary', 'productPairs', 'productIds', 'status', 'explanation',
  'recommendations', 'advice', 'title', 'detail'
].map((key) => [key.toLowerCase(), key]));
const normalizeConflictOutput = (value) => {
  if (Array.isArray(value)) return value.map(normalizeConflictOutput);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  const canonicalKey = (key) => conflictKeys[key.trim().toLowerCase()] || key.trim();
  // Observed " explanation" / "Explanation" are equivalent. Reject collisions.
  if (new Set(keys.map(canonicalKey)).size !== keys.length) return value;
  return Object.fromEntries(keys.map((key) => [canonicalKey(key), normalizeConflictOutput(value[key])]));
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
  const normalizeSubtype = (subtype) => {
    if (typeof subtype !== 'string') return subtype;
    if (subtypes[subtype]) return subtypes[subtype];
    if (subtype.includes('偏油') || (subtype.includes('T区') && subtype.includes('油'))) return '混油性';
    if (subtype.includes('偏干') || subtype.includes('两颊干')) return '混干性';
    if (subtype.includes('中性')) return '正常';
    return subtype;
  };
  const normalizeBlackheadSeverity = (severity) => ({
    轻微: '少量',
    轻度: '少量',
    中等: '中度',
    重度: '大量',
    严重: '大量'
  }[severity] || severity);
  const normalizeAcneCount = (count) => {
    if (typeof count !== 'number') return count;
    if (count <= 0) return '无';
    if (count <= 3) return '少量';
    if (count <= 10) return '中度';
    return '大量';
  };
  const normalizeActivity = (activity) => (
    typeof activity === 'string'
      && (activity.startsWith('无活动') || activity.includes('稳定期') || activity.includes('无明显红肿'))
      ? '不活跃'
      : activity
  );
  const normalizePoreSeverity = (severity) => {
    if (severity === '轻微') return '轻度';
    if (typeof severity !== 'string') return severity;
    if (severity.includes('严重')) return '严重';
    if (severity.includes('中度')) return '中度';
    if (severity.includes('轻度')) return '轻度';
    return severity;
  };
  return {
    ...value,
    skinType: value.skinType && {
      ...value.skinType,
      subtype: normalizeSubtype(value.skinType.subtype)
    },
    blackheads: value.blackheads && {
      ...value.blackheads,
      severity: normalizeBlackheadSeverity(value.blackheads.severity),
      distribution: distribution(value.blackheads.distribution)
    },
    acne: value.acne && {
      ...value.acne,
      count: normalizeAcneCount(value.acne.count),
      activity: value.acne.activity === '无' ? '不活跃' : normalizeActivity(value.acne.activity),
      distribution: distribution(value.acne.distribution)
    },
    pores: value.pores && {
      ...value.pores,
      severity: normalizePoreSeverity(value.pores.severity),
      distribution: distribution(value.pores.distribution)
    },
    otherIssues: normalizeSkinOtherIssues(value.otherIssues)
  };
};

module.exports = {
  normalizeOcrOutput,
  normalizeIngredientOutput,
  normalizeConflictOutput,
  normalizePlanOutput,
  normalizeSkinOutput
};
