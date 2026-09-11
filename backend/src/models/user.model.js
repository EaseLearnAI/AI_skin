const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const isValidPhone = (phone) => /^1[3-9]\d{9}$/.test(phone);

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    validate: { validator: isValidPhone, message: '请提供有效的手机号' }
  },
  password: {
    type: String,
    minlength: 6,
    select: false
  },
  appleSubject: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },
  appleRefreshTokenCiphertext: {
    type: String,
    select: false
  },
  authProviders: {
    type: [{ type: String, enum: ['phone', 'apple'] }],
    default: []
  },
  name: {
    type: String,
    required: [true, '姓名是必需的'],
    trim: true
  },
  email: { type: String, trim: true, lowercase: true },
  avatar: String,
  // Missing means legacy selection has not been initialized; null means explicitly inactive.
  activePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', select: false },
  gender: { type: String, enum: ['male', 'female'] },
  age: { type: Number, min: 13, max: 120 },
  profileStatus: {
    type: String,
    enum: ['incomplete', 'complete'],
    default: 'incomplete'
  },
  accountStatus: {
    type: String,
    enum: ['active', 'disabled', 'deleting'],
    default: 'active',
    select: false
  },
  tokenVersion: { type: Number, default: 0, select: false },
  menstrualCycle: {
    isInCycle: { type: Boolean, default: false },
    cycleDay: { type: Number, min: 1, max: 40, default: null },
    cycleLength: { type: Number, min: 21, max: 40, default: 28 },
    lastUpdated: { type: Date, default: null }
  },
  passwordChangedAt: Date,
  active: { type: Boolean, default: true, select: false }
}, { timestamps: true });

userSchema.pre('validate', function ensureIdentity() {
  if (!this.phone && !this.appleSubject) {
    throw new Error('用户必须至少绑定一种登录方式');
  }
  if (this.isNew && this.phone && !this.password) {
    throw new Error('手机号用户必须设置密码');
  }
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.correctPassword = function correctPassword(candidate, hash) {
  return bcrypt.compare(candidate, hash);
};

userSchema.methods.changedPasswordAfter = function changedPasswordAfter(timestamp) {
  if (!this.passwordChangedAt) return false;
  return timestamp < Math.floor(this.passwordChangedAt.getTime() / 1000);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.appleSubject;
    delete ret.appleRefreshTokenCiphertext;
    delete ret.accountStatus;
    delete ret.tokenVersion;
    delete ret.active;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
