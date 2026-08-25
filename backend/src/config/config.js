const DEFAULT_AI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const INSECURE_JWT_SECRETS = new Set([
  '',
  'your_very_secure_jwt_secret_key_change_in_production',
  'change_this_to_a_secure_random_value'
]);

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadConfig = (env = process.env) => {
  const nodeEnv = env.NODE_ENV || 'development';
  const jwtSecret = env.JWT_SECRET || (nodeEnv === 'production' ? '' : 'local-development-only-secret');
  const mongoURI = env.MONGODB_URI || (nodeEnv === 'production' ? '' : 'mongodb://localhost:27017/aiskin');

  if (!mongoURI) {
    throw new Error('MONGODB_URI is required');
  }
  if (nodeEnv === 'production' && (INSECURE_JWT_SECRETS.has(jwtSecret) || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
  }
  if (nodeEnv === 'production') {
    const required = [
      'API_KEY',
      'OSS_REGION',
      'OSS_ACCESS_KEY_ID',
      'OSS_ACCESS_KEY_SECRET',
      'OSS_BUCKET',
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_REFRESH_TOKEN_ENCRYPTION_KEY',
      'SMS_PROVIDER_URL',
      'SMS_PROVIDER_TOKEN'
    ];
    const missing = required.find((name) => !env[name]);
    if (missing) throw new Error(`${missing} is required in production`);
    if (env.APPLE_REFRESH_TOKEN_ENCRYPTION_KEY.length < 32) {
      throw new Error('APPLE_REFRESH_TOKEN_ENCRYPTION_KEY must have at least 32 characters in production');
    }
  }

  const storageConfigured = Boolean(
    env.OSS_REGION && env.OSS_ACCESS_KEY_ID && env.OSS_ACCESS_KEY_SECRET && env.OSS_BUCKET
  );
  return Object.freeze({
    nodeEnv,
    port: integer(env.PORT, 5000),
    mongoURI,
    jwt: Object.freeze({
      secret: jwtSecret,
      expiresIn: env.JWT_EXPIRES_IN || '7d'
    }),
    ai: Object.freeze({
      apiKey: env.API_KEY || '',
      baseURL: env.AI_BASE_URL || DEFAULT_AI_BASE_URL,
      textModel: env.AI_TEXT_MODEL || 'qwen3.7-flash',
      visionModel: env.AI_VISION_MODEL || 'qwen3-vl-plus',
      ocrModel: env.AI_OCR_MODEL || 'qwen-vl-ocr-latest',
      timeoutMs: integer(env.AI_TIMEOUT_MS, 100000)
    }),
    apple: Object.freeze({
      audience: env.APPLE_AUDIENCE || 'personal.AIskin',
      issuer: 'https://appleid.apple.com',
      jwksURI: env.APPLE_JWKS_URI || 'https://appleid.apple.com/auth/keys',
      tokenURL: env.APPLE_TOKEN_URL || 'https://appleid.apple.com/auth/token',
      revokeURL: env.APPLE_REVOKE_URL || 'https://appleid.apple.com/auth/revoke',
      teamId: env.APPLE_TEAM_ID || '',
      keyId: env.APPLE_KEY_ID || '',
      privateKey: (env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      refreshTokenEncryptionKey: env.APPLE_REFRESH_TOKEN_ENCRYPTION_KEY || ''
    }),
    storage: Object.freeze({
      configured: storageConfigured,
      region: env.OSS_REGION || '',
      accessKeyId: env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
      bucket: env.OSS_BUCKET || '',
      authorizationV4: env.OSS_AUTHORIZATION_V4 === 'true',
      productImagesPublic: env.OSS_PRODUCT_IMAGES_PUBLIC === 'true',
      faceSignedUrlExpiresSeconds: integer(env.OSS_FACE_SIGNED_URL_EXPIRES_SECONDS, 900)
    }),
    sms: Object.freeze({
      url: env.SMS_PROVIDER_URL || '',
      token: env.SMS_PROVIDER_TOKEN || '',
      timeoutMs: integer(env.SMS_TIMEOUT_MS, 5000)
    })
  });
};

module.exports = { loadConfig };
