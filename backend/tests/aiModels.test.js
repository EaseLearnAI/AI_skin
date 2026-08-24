describe('AI model configuration', () => {
  const originalTextModel = process.env.AI_TEXT_MODEL;
  const originalVisionModel = process.env.AI_VISION_MODEL;

  afterEach(() => {
    jest.resetModules();

    if (originalTextModel === undefined) {
      delete process.env.AI_TEXT_MODEL;
    } else {
      process.env.AI_TEXT_MODEL = originalTextModel;
    }

    if (originalVisionModel === undefined) {
      delete process.env.AI_VISION_MODEL;
    } else {
      process.env.AI_VISION_MODEL = originalVisionModel;
    }
  });

  test('uses the selected production defaults', () => {
    delete process.env.AI_TEXT_MODEL;
    delete process.env.AI_VISION_MODEL;

    const models = require('../config/aiModels');

    expect(models.TEXT_MODEL).toBe('qwen3.7-flash');
    expect(models.VISION_MODEL).toBe('qwen3-vl-plus');
  });

  test('allows environment overrides without changing application code', () => {
    process.env.AI_TEXT_MODEL = 'text-model-for-test';
    process.env.AI_VISION_MODEL = 'vision-model-for-test';

    const models = require('../config/aiModels');

    expect(models.TEXT_MODEL).toBe('text-model-for-test');
    expect(models.VISION_MODEL).toBe('vision-model-for-test');
  });
});
