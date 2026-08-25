const axios = require('axios');

const { ApiError } = require('../../middlewares/error');

const createPasswordResetSender = ({ url, token, timeoutMs = 5000, httpClient = axios }) => ({
  async sendCode(phone, code) {
    if (!url || !token) throw new ApiError(503, '短信服务尚未配置', 'SMS_NOT_CONFIGURED');
    try {
      await httpClient.post(
        url,
        { phone, code, purpose: 'password_reset' },
        { headers: { Authorization: `Bearer ${token}` }, timeout: timeoutMs }
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, '短信发送失败', 'SMS_UPSTREAM_ERROR');
    }
  }
});

module.exports = { createPasswordResetSender };
