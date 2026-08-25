const { loadConfig } = require('../../src/config/config');

describe('runtime configuration', () => {
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
      timeoutMs: 100000
    });
    expect(config.storage).toMatchObject({
      configured: false,
      productImagesPublic: false,
      faceSignedUrlExpiresSeconds: 900
    });
  });
});
