const axios = require('axios');
const jwt = require('jsonwebtoken');

const { ApiError } = require('../../middlewares/error');

const createAppleOAuthClient = ({
  audience,
  teamId,
  keyId,
  privateKey,
  tokenURL,
  revokeURL,
  httpClient = axios
}) => {
  const assertConfigured = () => {
    if (!audience || !teamId || !keyId || !privateKey) {
      throw new ApiError(503, 'Apple 服务端凭据尚未配置', 'APPLE_NOT_CONFIGURED');
    }
  };
  const clientSecret = () => {
    assertConfigured();
    return jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      keyid: keyId,
      issuer: teamId,
      subject: audience,
      audience: 'https://appleid.apple.com',
      expiresIn: '5m'
    });
  };
  const postForm = async (url, form) => httpClient.post(url, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  });

  return {
    async exchangeCode(authorizationCode) {
      const form = new URLSearchParams({
        client_id: audience,
        client_secret: clientSecret(),
        code: authorizationCode,
        grant_type: 'authorization_code'
      });
      try {
        const response = await postForm(tokenURL, form);
        if (!response.data?.refresh_token) {
          throw new Error('Apple response did not include a refresh token');
        }
        return {
          refreshToken: response.data.refresh_token,
          accessToken: response.data.access_token
        };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(401, 'Apple authorization code 无效', 'APPLE_CODE_INVALID');
      }
    },
    async revokeRefreshToken(refreshToken) {
      const form = new URLSearchParams({
        client_id: audience,
        client_secret: clientSecret(),
        token: refreshToken,
        token_type_hint: 'refresh_token'
      });
      try {
        await postForm(revokeURL, form);
      } catch (error) {
        throw new ApiError(502, 'Apple 凭证撤销失败', 'APPLE_REVOKE_FAILED');
      }
    }
  };
};

module.exports = { createAppleOAuthClient };
