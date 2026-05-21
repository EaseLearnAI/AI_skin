const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'your_very_secure_jwt_secret_key_change_in_production',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  return jwt.verify(
    token, 
    process.env.JWT_SECRET || 'your_very_secure_jwt_secret_key_change_in_production'
  );
};

module.exports = {
  generateToken,
  verifyToken
}; 