const jwt = require('jsonwebtoken');

const createJwtProvider = ({ secret, expiresIn }) => ({
  sign(user) {
    return jwt.sign(
      { id: user._id.toString(), tokenVersion: user.tokenVersion || 0 },
      secret,
      { expiresIn }
    );
  },
  verify(token) {
    return jwt.verify(token, secret);
  }
});

module.exports = { createJwtProvider };
