const crypto = require('crypto');

const deriveKey = (secret) => crypto.createHash('sha256').update(secret).digest();

const encrypt = (plaintext, secret) => {
  if (!plaintext) return '';
  if (!secret) throw new Error('Apple refresh token encryption key is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
};

const decrypt = (payload, secret) => {
  if (!payload) return '';
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
};

module.exports = { encrypt, decrypt };
