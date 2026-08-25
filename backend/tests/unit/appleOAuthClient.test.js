const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { createAppleOAuthClient } = require('../../src/providers/apple/appleOAuthClient');

describe('Apple OAuth client', () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  test('exchanges a one-time native authorization code using a signed client secret', async () => {
    const httpClient = {
      post: jest.fn(async () => ({ data: { refresh_token: 'refresh-token', access_token: 'access-token' } }))
    };
    const client = createAppleOAuthClient({
      audience: 'personal.AIskin',
      teamId: '9CUS5VPDW7',
      keyId: 'APPLEKEY1',
      privateKey: privateKeyPem,
      tokenURL: 'https://appleid.apple.com/auth/token',
      revokeURL: 'https://appleid.apple.com/auth/revoke',
      httpClient
    });

    await expect(client.exchangeCode('one-time-code')).resolves.toEqual({
      refreshToken: 'refresh-token',
      accessToken: 'access-token'
    });
    const [url, form] = httpClient.post.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(form.get('client_id')).toBe('personal.AIskin');
    expect(form.get('code')).toBe('one-time-code');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(jwt.decode(form.get('client_secret'), { complete: true })).toMatchObject({
      header: { alg: 'ES256', kid: 'APPLEKEY1' },
      payload: { iss: '9CUS5VPDW7', sub: 'personal.AIskin', aud: 'https://appleid.apple.com' }
    });
  });

  test('revokes the saved refresh token without exposing it in a URL', async () => {
    const httpClient = { post: jest.fn(async () => ({ data: {} })) };
    const client = createAppleOAuthClient({
      audience: 'personal.AIskin',
      teamId: '9CUS5VPDW7',
      keyId: 'APPLEKEY1',
      privateKey: privateKeyPem,
      tokenURL: 'token-url',
      revokeURL: 'revoke-url',
      httpClient
    });

    await client.revokeRefreshToken('refresh-token');

    const [url, form] = httpClient.post.mock.calls[0];
    expect(url).toBe('revoke-url');
    expect(form.get('token')).toBe('refresh-token');
    expect(form.get('token_type_hint')).toBe('refresh_token');
  });
});
