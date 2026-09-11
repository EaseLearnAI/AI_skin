const { normalizeSkinOtherIssues } = require('../../src/utils/skinOtherIssues');
const { schemas } = require('../../src/providers/ai/outputSchemas');

describe('skin other-issues compatibility', () => {
  test('preserves observed redness/texture arrays without inventing disease flags or scores', () => {
    const source = { redness: ['鼻翼两侧轻微泛红'], texture: ['脸颊可见细小纹理'] };
    const normalized = normalizeSkinOtherIssues(source);
    expect(normalized).toEqual({ observations: [
      { category: 'redness', details: ['鼻翼两侧轻微泛红'] },
      { category: 'texture', details: ['脸颊可见细小纹理'] }
    ] });
    expect(source.redness).toEqual(['鼻翼两侧轻微泛红']);
    expect(schemas.skin.extract('otherIssues').validate(normalized).error).toBeUndefined();
    expect(schemas.skin.extract('otherIssues').validate(source).error).toBeDefined();
  });

  test('keeps valid structured fields and retains unknown nested values as original JSON text', () => {
    const source = { redness: { exists: true, severity: '轻度', distribution: ['鼻翼'], note: { timing: ['早晨'] } },
      skinToneEvenness: { score: '无法测量', description: '光线影响判断' } };
    const normalized = normalizeSkinOtherIssues(source);
    expect(normalized.redness).toEqual({ exists: true, severity: '轻度', distribution: ['鼻翼'] });
    expect(normalized.skinToneEvenness).toEqual({ description: '光线影响判断' });
    expect(normalized.observations).toEqual([
      { category: 'redness.note', details: [JSON.stringify({ timing: ['早晨'] })] },
      { category: 'skinToneEvenness.score', details: ['无法测量'] }
    ]);
    expect(normalizeSkinOtherIssues(normalized)).toEqual(normalized);
  });

  test('canonical optional issues accept no invented defaults and forbid arbitrary unknown structure', () => {
    const schema = schemas.skin.extract('otherIssues');
    expect(schema.validate({ redness: { description: '轻微泛红' } }).value)
      .toEqual({ redness: { description: '轻微泛红' } });
    expect(schema.validate({ texture: ['未知键'] }).error).toBeDefined();
    expect(schema.validate({ observations: [{ category: 'texture', details: '应为数组' }] }).error).toBeDefined();
  });
});
