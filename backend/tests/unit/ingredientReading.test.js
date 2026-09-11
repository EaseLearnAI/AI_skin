const { schemas } = require('../../src/providers/ai/outputSchemas');
const { normalizeIngredientOutput } = require('../../src/providers/ai/outputNormalizers');
const { ingredientPrompt } = require('../../src/prompts');

const report = () => ({
  safetyIndex: 80, efficacyScore: 3.5, activeIngredients: 2,
  acneRisk: { level: '低', percentage: 10 },
  irritationRisk: { level: '中', percentage: 30 },
  allergyRisk: { level: '中', percentage: 30 },
  overallRating: 3.5,
  summary: '配方以清洁为主，使用后可能干燥，敏感肌需留意耐受。',
  efficacyAnalysis: ['清洁油脂：可能帮助带走表面油脂，实际效果取决于配方。'],
  potentialRisks: ['干燥紧绷：频繁清洁可能导致不适，干性肌需留意。'],
  recommendations: ['观察耐受：首次局部试用，不适时暂停。']
});

test('keeps the existing iOS string-array contract and conditional copy', () => {
  const original = report();
  expect(schemas.ingredients.validate(normalizeIngredientOutput(original)).error).toBeUndefined();
  expect(normalizeIngredientOutput(original)).toEqual(original);
});

test.each([
  { summary: '长'.repeat(61) },
  { efficacyAnalysis: ['无短标题的长说明'] },
  { potentialRisks: ['标题过长不适合作为条目阅读起点：可能存在风险。'] },
  { recommendations: ['建议：' + '长'.repeat(43)] },
  { potentialRisks: [] },
  { efficacyAnalysis: Array(4).fill('功效：可能有帮助。') },
  { summary: '<b>保湿</b>' }
])('rejects invalid reading content rather than silently truncating it: %j', (patch) => {
  expect(schemas.ingredients.validate(normalizeIngredientOutput({ ...report(), ...patch })).error).toBeDefined();
});

test('normalizes whitespace and ASCII title separators without changing meaning', () => {
  const value = { ...report(), efficacyAnalysis: ['  清洁油脂: 可能帮助带走油脂。  '] };
  const normalized = normalizeIngredientOutput(value);
  expect(normalized.efficacyAnalysis).toEqual(['清洁油脂：可能帮助带走油脂。']);
  expect(schemas.ingredients.validate(normalized).error).toBeUndefined();
});

test('prompt separates concise product conclusions from UI-owned disclosure', () => {
  const prompt = ingredientPrompt({ productName: '未命名产品', ingredients: ['水'], validationFeedback: '请缩短文案' });
  expect(prompt).toContain('最多60字');
  expect(prompt).toContain('标题：说明');
  expect(prompt).toContain('不得编造浓度');
  expect(prompt).toContain('产品类别无法确认');
  expect(prompt).toContain('请缩短文案');
});
