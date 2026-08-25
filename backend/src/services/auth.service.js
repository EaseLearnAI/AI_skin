const crypto = require('crypto');

const User = require('../models/user.model');
const PasswordResetToken = require('../models/passwordResetToken.model');
const { createJwtProvider } = require('../providers/auth/jwt');
const { encrypt, decrypt } = require('../utils/encryption');
const { ApiError } = require('../middlewares/error');

const normalizePhone = (phone) => String(phone || '').trim();
const hashCode = (phone, code, secret) => crypto
  .createHash('sha256')
  .update(`${phone}:${code}:${secret}`)
  .digest('hex');

const defaultCodeGenerator = () => String(crypto.randomInt(100000, 1000000));

const createAuthService = ({
  jwtSecret,
  jwtExpiresIn,
  appleVerifier,
  appleOAuthClient,
  passwordResetSender = { sendCode: async () => undefined },
  passwordResetCodeGenerator = defaultCodeGenerator,
  onPasswordResetDeliveryError = () => undefined,
  refreshTokenEncryptionKey = '',
  accountDeletionService = { deleteAll: async () => undefined }
}) => {
  const jwtProvider = createJwtProvider({ secret: jwtSecret, expiresIn: jwtExpiresIn });

  const session = (user) => ({ token: jwtProvider.sign(user), user });

  const registerPhone = async ({ name, phone, password, gender }) => {
    const normalizedPhone = normalizePhone(phone);
    if (await User.exists({ phone: normalizedPhone })) {
      throw new ApiError(400, '该手机号已被注册', 'PHONE_ALREADY_REGISTERED');
    }
    try {
      const user = await User.create({
        name: name.trim(),
        phone: normalizedPhone,
        password,
        gender,
        authProviders: ['phone'],
        profileStatus: name && gender ? 'complete' : 'incomplete'
      });
      return session(user);
    } catch (error) {
      if (error.code === 11000) throw new ApiError(400, '该手机号已被注册', 'PHONE_ALREADY_REGISTERED');
      throw error;
    }
  };

  const loginPhone = async ({ phone, password }) => {
    const user = await User.findOne({ phone: normalizePhone(phone) })
      .select('+password +tokenVersion +accountStatus');
    if (!user || user.accountStatus !== 'active' || !(await user.correctPassword(password, user.password))) {
      throw new ApiError(401, '手机号或密码错误', 'INVALID_CREDENTIALS');
    }
    return session(user);
  };

  const verifyApple = async (credentials) => {
    if (!appleVerifier) throw new ApiError(503, 'Apple 登录尚未配置', 'APPLE_NOT_CONFIGURED');
    return appleVerifier.verify(credentials);
  };

  const exchangeAppleCode = async (authorizationCode) => {
    if (!appleOAuthClient) throw new ApiError(503, 'Apple 登录尚未配置', 'APPLE_NOT_CONFIGURED');
    return appleOAuthClient.exchangeCode(authorizationCode);
  };

  const loginApple = async (credentials) => {
    const claims = await verifyApple(credentials);
    let user = await User.findOne({ appleSubject: claims.sub }).select('+appleSubject +tokenVersion +accountStatus');
    if (user) {
      if (user.accountStatus !== 'active') throw new ApiError(401, '账号不可用', 'ACCOUNT_DISABLED');
      return session(user);
    }

    const tokenResult = await exchangeAppleCode(credentials.authorizationCode);
    const suppliedName = [credentials.givenName, credentials.familyName].filter(Boolean).join(' ').trim();
    const displayName = suppliedName || `AI Skin 用户${crypto.randomInt(1000, 10000)}`;
    try {
      user = await User.create({
        appleSubject: claims.sub,
        appleRefreshTokenCiphertext: encrypt(tokenResult.refreshToken, refreshTokenEncryptionKey),
        authProviders: ['apple'],
        name: displayName,
        profileStatus: suppliedName ? 'incomplete' : 'incomplete'
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await User.findOne({ appleSubject: claims.sub }).select('+tokenVersion +accountStatus');
    }
    return session(user);
  };

  const linkApple = async (userId, credentials) => {
    const claims = await verifyApple(credentials);
    const owner = await User.findOne({ appleSubject: claims.sub }).select('+appleSubject');
    if (owner && owner._id.toString() !== userId.toString()) {
      throw new ApiError(409, '该 Apple 账号已绑定其他用户', 'APPLE_ALREADY_LINKED');
    }
    const tokenResult = await exchangeAppleCode(credentials.authorizationCode);
    const user = await User.findById(userId).select('+appleSubject +appleRefreshTokenCiphertext');
    if (!user) throw new ApiError(404, '用户不存在', 'USER_NOT_FOUND');
    user.appleSubject = claims.sub;
    user.appleRefreshTokenCiphertext = encrypt(tokenResult.refreshToken, refreshTokenEncryptionKey);
    user.authProviders = Array.from(new Set([...user.authProviders, 'apple']));
    await user.save();
    return user;
  };

  const authenticateAccessToken = async (token) => {
    let decoded;
    try {
      decoded = jwtProvider.verify(token);
    } catch (error) {
      throw new ApiError(401, 'Invalid token. Please log in again.', 'INVALID_TOKEN');
    }
    const user = await User.findById(decoded.id).select('+tokenVersion +accountStatus +active');
    if (!user || user.accountStatus !== 'active' || user.active === false) {
      throw new ApiError(401, 'The user belonging to this token no longer exists.', 'USER_NOT_ACTIVE');
    }
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0) || user.changedPasswordAfter(decoded.iat)) {
      throw new ApiError(401, 'User credentials changed. Please log in again.', 'TOKEN_REVOKED');
    }
    return user;
  };

  const requestPasswordReset = async ({ phone }) => {
    const normalizedPhone = normalizePhone(phone);
    const user = await User.exists({ phone: normalizedPhone });
    if (user) {
      const code = passwordResetCodeGenerator();
      await PasswordResetToken.findOneAndUpdate(
        { phone: normalizedPhone },
        {
          codeHash: hashCode(normalizedPhone, code, jwtSecret),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      try {
        await passwordResetSender.sendCode(normalizedPhone, code);
      } catch (error) {
        onPasswordResetDeliveryError(error);
      }
    }
    return { message: '如果该手机号已注册，验证码将发送至该号码' };
  };

  const confirmPasswordReset = async ({ phone, verificationCode, newPassword }) => {
    const normalizedPhone = normalizePhone(phone);
    const reset = await PasswordResetToken.findOne({ phone: normalizedPhone });
    if (!reset || reset.expiresAt <= new Date() || reset.attempts >= 5) {
      throw new ApiError(400, '验证码无效或已过期', 'RESET_CODE_INVALID');
    }
    const actual = Buffer.from(reset.codeHash, 'hex');
    const expected = Buffer.from(hashCode(normalizedPhone, verificationCode, jwtSecret), 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      reset.attempts += 1;
      await reset.save();
      throw new ApiError(400, '验证码无效或已过期', 'RESET_CODE_INVALID');
    }
    const user = await User.findOne({ phone: normalizedPhone }).select('+password +tokenVersion');
    if (!user) throw new ApiError(400, '验证码无效或已过期', 'RESET_CODE_INVALID');
    user.password = newPassword;
    user.passwordChangedAt = new Date(Date.now() - 1000);
    user.tokenVersion += 1;
    await user.save();
    await PasswordResetToken.deleteOne({ _id: reset._id });
  };

  const logout = async (userId) => {
    await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  };

  const deleteAccount = async (userId) => {
    const user = await User.findById(userId).select('+appleRefreshTokenCiphertext +appleSubject');
    if (!user) throw new ApiError(404, '用户不存在', 'USER_NOT_FOUND');
    if (user.appleRefreshTokenCiphertext) {
      const refreshToken = decrypt(user.appleRefreshTokenCiphertext, refreshTokenEncryptionKey);
      await appleOAuthClient.revokeRefreshToken(refreshToken);
    }
    await accountDeletionService.deleteAll(userId);
    await PasswordResetToken.deleteMany({ phone: user.phone });
    await User.deleteOne({ _id: userId });
  };

  return {
    registerPhone,
    loginPhone,
    loginApple,
    linkApple,
    authenticateAccessToken,
    requestPasswordReset,
    confirmPasswordReset,
    logout,
    deleteAccount
  };
};

module.exports = { createAuthService, normalizePhone };
