const { ApiError } = require('../middlewares/error');
const { schemas } = require('../providers/ai/outputSchemas');

// Cross-field checks belong to the workflow: the model must address the exact selection.
const validateConflictReport = (report, selectedIds) => {
  const invalid = () => { throw new ApiError(502, '产品搭配结果不完整，请重新检测', 'AI_OUTPUT_INVALID'); };
  if (schemas.conflict.validate(report, { convert: false }).error) invalid();
  const ids = new Set(selectedIds);
  const pairs = new Set();
  for (const pair of report.productPairs) {
    if (pair.productIds.some((id) => !ids.has(id))) invalid();
    const key = [...pair.productIds].sort().join(':');
    if (pairs.has(key)) invalid();
    pairs.add(key);
  }
  if (pairs.size !== ids.size * (ids.size - 1) / 2) invalid();
  const statuses = report.productPairs.map((pair) => pair.status);
  const score = report.riskScore;
  if (statuses.includes('unknown')) {
    if (score !== null) invalid();
  } else {
    if (score === null) invalid();
    const [min, max] = statuses.includes('avoid') ? [3, 5] : statuses.includes('caution') ? [1, 3] : [-1, 1];
    if (score <= min || score > max) invalid();
  }
  return report;
};

// Production guidance is deliberately selected by status, not open-ended model prose.
// It does not manufacture an assessment or score; those must validate first.
const adviceByStatus = {
  unknown: { title: '先确认使用说明', detail: '先确认这些产品的使用部位、用量及是否需要冲洗，再判断能否在同一次护理中使用。' },
  avoid: { title: '避免同时叠加', detail: '这些产品暂不在同一次护理中叠加，按各自使用说明分开使用。' },
  caution: { title: '先分开使用', detail: '先在不同护理时段使用这些产品，分别观察耐受情况，再决定是否叠加。' },
  compatible: { title: '逐步尝试搭配', detail: '先分别确认这些产品用后无不适，再按各自说明少量搭配使用。' }
};
const buildConflictAdvice = (pairs) => {
  const advice = Object.entries(adviceByStatus).flatMap(([status, text]) => {
    const productIds = [...new Set(pairs.filter((pair) => pair.status === status).flatMap((pair) => pair.productIds))];
    return productIds.length ? [{ productIds, ...text }] : [];
  }).slice(0, 2);
  const knownIds = [...new Set(pairs.filter((pair) => pair.status !== 'unknown').flatMap((pair) => pair.productIds))];
  if (knownIds.length) advice.push({ productIds: knownIds, title: '出现不适就暂停',
    detail: '搭配后若出现刺痛、泛红等不适，先暂停这些产品的叠加使用。' });
  return { advice };
};

module.exports = { validateConflictReport, buildConflictAdvice };
