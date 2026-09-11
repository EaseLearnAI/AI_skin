const { normalizeConflictOutput } = require('../../src/providers/ai/outputNormalizers');
const { schemas } = require('../../src/providers/ai/outputSchemas');
const { validateConflictReport, buildConflictAdvice } = require('../../src/services/conflictReport');
const { conflictReport } = require('../fixtures/conflictReport');
const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('product-scoped conflict contract', () => {
  test('requires a real score and all selected pairs', () => {
    const report = conflictReport(products);
    expect(() => validateConflictReport(report, products.map((p) => p.id))).not.toThrow();
    delete report.riskScore;
    expect(schemas.conflict.validate(report).error).toBeDefined();
  });
  test.each([' explanation', 'Explanation'])('normalizes observed key %s without data loss', (key) => {
    const report = conflictReport(products);
    report.productPairs[0][key] = report.productPairs[0].explanation;
    delete report.productPairs[0].explanation;
    expect(schemas.conflict.validate(normalizeConflictOutput(report)).error).toBeUndefined();
    report.productPairs[0].explanation = '不同的内容';
    expect(schemas.conflict.validate(normalizeConflictOutput(report)).error).toBeDefined();
  });
  test.each(['missing', 'duplicate', 'foreign', 'self', 'inconsistentScore'])(
    'rejects %s results before persistence', (kind) => {
      const report = conflictReport(products);
      if (kind === 'missing') report.productPairs.pop();
      if (kind === 'duplicate') report.productPairs[1] = { ...report.productPairs[0], productIds: ['b', 'a'] };
      if (kind === 'foreign') report.productPairs[0].productIds[0] = 'outside';
      if (kind === 'self') report.productPairs[0].productIds = ['a', 'a'];
      if (kind === 'inconsistentScore') report.riskScore = 5;
      expect(() => validateConflictReport(report, products.map((p) => p.id))).toThrow();
    });
  test('unknown evidence cannot masquerade as zero risk', () => {
    const report = conflictReport(products);
    report.productPairs[0].status = 'unknown';
    expect(() => validateConflictReport(report, products.map((p) => p.id))).toThrow();
    report.riskScore = null;
    expect(() => validateConflictReport(report, products.map((p) => p.id))).not.toThrow();
  });
  test.each(['<div>建议</div>', '```json', '{"advice":"建议"}', '\\u4f60', '乱码�'])(
    'rejects non-readable text: %s', (text) => {
      const report = conflictReport(products);
      report.productPairs[0].explanation = text;
      expect(schemas.conflict.validate(report).error).toBeDefined();
    });
  test('rejects overlong explanations and model-authored extra product advice', () => {
    const report = conflictReport(products);
    report.productPairs[0].explanation = '成分'.repeat(41);
    expect(schemas.conflict.validate(report).error).toBeDefined();
    report.productPairs[0].explanation = '简短说明';
    report.recommendations = { advice: [{ detail: '再添加一瓶面霜' }] };
    expect(schemas.conflict.validate(report).error).toBeDefined();
  });
  test.each(['compatible', 'caution', 'avoid', 'unknown'])('renders concise product-only actions for %s', (status) => {
    const advice = buildConflictAdvice([{ productIds: ['a', 'b'], status }]).advice;
    expect(advice.length).toBeLessThanOrEqual(3);
    expect(advice.length).toBeGreaterThan(0);
    for (const item of advice) {
      expect(item.productIds).toEqual(['a', 'b']);
      expect(item.title.length).toBeLessThanOrEqual(12);
      expect(item.detail.length).toBeLessThanOrEqual(60);
      expect(item.detail).not.toMatch(/面霜|保湿|防晒|精华|早间|晚间/);
    }
    if (status === 'unknown') expect(advice[0].title).toBe('先确认使用说明');
    if (status === 'avoid') expect(advice[0].title).toBe('避免同时叠加');
  });
  test('groups actions by status without leaking unselected IDs or growing with ingredient count', () => {
    const advice = buildConflictAdvice([
      { productIds: ['a', 'b'], status: 'unknown' },
      { productIds: ['b', 'c'], status: 'avoid' },
      { productIds: ['a', 'c'], status: 'caution' }
    ]).advice;
    expect(advice).toHaveLength(3);
    expect(advice[0].productIds).toEqual(['a', 'b']);
    expect(advice[1].productIds).toEqual(['b', 'c']);
  });
});
