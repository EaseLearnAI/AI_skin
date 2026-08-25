const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const { ApiError } = require('../../middlewares/error');

const createAppleTokenVerifier = ({
  audience,
  issuer = 'https://appleid.apple.com',
  jwksURI = 'https://appleid.apple.com/auth/keys',
  getSigningKey
}) => {
  const client = getSigningKey ? null : jwksClient({
    jwksUri: jwksURI,
    cache: true,
    cacheMaxAge: 6 * 60 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
  });
  const resolveKey = getSigningKey || (async (kid) => {
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  });

  return {
    async verify({ identityToken, rawNonce }) {
      try {
        const decoded = jwt.decode(identityToken, { complete: true });
        if (!decoded?.header?.kid || decoded.header.alg !== 'RS256') {
          throw new ApiError(401, 'Apple 凭证无效', 'APPLE_TOKEN_INVALID');
        }
        const publicKey = await resolveKey(decoded.header.kid);
        const claims = jwt.verify(identityToken, publicKey, {
          algorithms: ['RS256'],
          issuer,
          audience
        });
        const expectedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');
        if (!claims.nonce || claims.nonce !== expectedNonce) {
          throw new ApiError(401, 'Apple nonce 验证失败', 'APPLE_NONCE_INVALID');
        }
        if (!claims.sub) {
          throw new ApiError(401, 'Apple 凭证缺少用户标识', 'APPLE_TOKEN_INVALID');
        }
        return { sub: claims.sub, nonce: claims.nonce, email: claims.email };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(401, 'Apple 凭证无效', 'APPLE_TOKEN_INVALID');
      }
    }
  };
};

module.exports = { createAppleTokenVerifier };
