const { createPasswordResetSender } = require('../../src/providers/sms/passwordResetSender');

describe('password reset sender', () => {
  test('sends the verification code to the configured private SMS gateway', async () => {
    const httpClient = { post: jest.fn(async () => ({ status: 202 })) };
    const sender = createPasswordResetSender({
      url: 'https://sms.internal/send',
      token: 'gateway-secret',
      timeoutMs: 5000,
      httpClient
    });

    await sender.sendCode('13900000001', '123456');

    expect(httpClient.post).toHaveBeenCalledWith(
      'https://sms.internal/send',
      { phone: '13900000001', code: '123456', purpose: 'password_reset' },
      { headers: { Authorization: 'Bearer gateway-secret' }, timeout: 5000 }
    );
  });

  test('fails explicitly when no SMS gateway is configured', async () => {
    const sender = createPasswordResetSender({ url: '', token: '' });

    await expect(sender.sendCode('13900000001', '123456'))
      .rejects.toMatchObject({ statusCode: 503, code: 'SMS_NOT_CONFIGURED' });
  });
});
