const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { createAppleTokenVerifier } = require('../../src/providers/apple/appleTokenVerifier');

describe('Apple identity token verifier', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rawNonce = 'native-ios-raw-nonce';
  const nonce = crypto.createHash('sha256').update(rawNonce).digest('hex');
  const verifier = createAppleTokenVerifier({
    audience: 'personal.AIskin',
    issuer: 'https://appleid.apple.com',
    getSigningKey: async (kid) => {
      expect(kid).toBe('apple-key-1');
      return publicKey.export({ type: 'spki', format: 'pem' });
    }
  });

  const sign = (overrides = {}) => jwt.sign({
    sub: 'apple-subject',
    nonce,
    ...overrides
  }, privateKey, {
    algorithm: 'RS256',
    keyid: 'apple-key-1',
    issuer: 'https://appleid.apple.com',
    audience: 'personal.AIskin',
    expiresIn: '5m'
  });

  test('returns only verified identity claims for a valid native token', async () => {
    await expect(verifier.verify({ identityToken: sign(), rawNonce }))
      .resolves.toMatchObject({ sub: 'apple-subject', nonce });
  });

  test('rejects a validly signed token when the raw nonce does not match', async () => {
    await expect(verifier.verify({ identityToken: sign(), rawNonce: 'different-nonce' }))
      .rejects.toMatchObject({ statusCode: 401, code: 'APPLE_NONCE_INVALID' });
  });

  test('rejects a token issued for another application', async () => {
    const wrongAudience = jwt.sign({ sub: 'apple-subject', nonce }, privateKey, {
      algorithm: 'RS256',
      keyid: 'apple-key-1',
      issuer: 'https://appleid.apple.com',
      audience: 'another.bundle',
      expiresIn: '5m'
    });

    await expect(verifier.verify({ identityToken: wrongAudience, rawNonce }))
      .rejects.toMatchObject({ statusCode: 401, code: 'APPLE_TOKEN_INVALID' });
  });
});
