describe('AI model configuration', () => {
  const originalTextModel = process.env.AI_TEXT_MODEL;
  const originalVisionModel = process.env.AI_VISION_MODEL;
  const originalOcrModel = process.env.AI_OCR_MODEL;

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

    if (originalOcrModel === undefined) {
      delete process.env.AI_OCR_MODEL;
    } else {
      process.env.AI_OCR_MODEL = originalOcrModel;
    }
  });

  test('uses the selected production defaults', () => {
    delete process.env.AI_TEXT_MODEL;
    delete process.env.AI_VISION_MODEL;
    delete process.env.AI_OCR_MODEL;

    const models = require('../config/aiModels');

    expect(models.TEXT_MODEL).toBe('qwen3.7-flash');
    expect(models.VISION_MODEL).toBe('qwen3-vl-plus');
    expect(models.OCR_MODEL).toBe('qwen-vl-ocr-latest');
  });

  test('allows environment overrides without changing application code', () => {
    process.env.AI_TEXT_MODEL = 'text-model-for-test';
    process.env.AI_VISION_MODEL = 'vision-model-for-test';
    process.env.AI_OCR_MODEL = 'ocr-model-for-test';

    const models = require('../config/aiModels');

    expect(models.TEXT_MODEL).toBe('text-model-for-test');
    expect(models.VISION_MODEL).toBe('vision-model-for-test');
    expect(models.OCR_MODEL).toBe('ocr-model-for-test');
  });
});
