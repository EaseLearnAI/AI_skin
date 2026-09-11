const { loadConfig } = require('../../src/config/config');

describe('runtime configuration', () => {
  test('keeps loopback as the default listener and accepts an explicit LAN binding', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'test', BIND_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  test('allows explicit text, vision and OCR model overrides', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AI_TEXT_MODEL: 'text-model-for-test',
      AI_VISION_MODEL: 'vision-model-for-test',
      AI_OCR_MODEL: 'ocr-model-for-test'
    });
    expect(config.ai).toMatchObject({
      textModel: 'text-model-for-test',
      visionModel: 'vision-model-for-test',
      ocrModel: 'ocr-model-for-test'
    });
  });

  test('accepts a positive ingredient thinking budget and an explicit rollback to provider defaults', () => {
    expect(loadConfig({ AI_INGREDIENT_THINKING_BUDGET: '2048' }).ai.ingredientThinkingBudget).toBe(2048);
    expect(loadConfig({ AI_INGREDIENT_THINKING_BUDGET: 'default' }).ai.ingredientThinkingBudget).toBeUndefined();
    for (const invalid of ['0', '-1', '12ms', '1.5', 'false', '']) {
      expect(() => loadConfig({ AI_INGREDIENT_THINKING_BUDGET: invalid })).toThrow('AI_INGREDIENT_THINKING_BUDGET');
    }
  });

  test('fails closed when production secrets are missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/aiskin' }))
      .toThrow('JWT_SECRET');
  });

  test('does not start production with only database and JWT configured', () => {
    expect(() => loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://db/aiskin',
      JWT_SECRET: 'production-secret-with-at-least-32-characters'
    })).toThrow('API_KEY');
  });

  test('keeps the selected text, vision and OCR model defaults', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough',
      MONGODB_URI: 'mongodb://localhost/aiskin-test'
    });

    expect(config.ai).toEqual({
      apiKey: '',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      textModel: 'qwen3.7-flash',
      visionModel: 'qwen3-vl-plus',
      ocrModel: 'qwen-vl-ocr-latest',
      ingredientThinkingBudget: 2048,
      timeoutMs: 100000
    });
    expect(config.storage).toMatchObject({
      configured: false,
      productImagesPublic: false,
      faceSignedUrlExpiresSeconds: 900
    });
  });
});
