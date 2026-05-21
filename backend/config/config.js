const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const config = {
  // Server configuration
  port: process.env.PORT || 5000,
  
  // MongoDB configuration
  mongoURI: process.env.MONGODB_URI || 'mongodb://localhost:27017/aiskin',
  
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET || 'your_very_secure_jwt_secret_key_change_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development'
};

module.exports = config; 