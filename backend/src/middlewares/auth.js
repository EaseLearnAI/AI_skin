const { ApiError } = require('./error');

const createProtect = (authService) => async (req, res, next) => {
  try {
    const authorization = req.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) {
      throw new ApiError(401, 'You are not logged in. Please log in to access this resource.', 'AUTH_REQUIRED');
    }
    req.user = await authService.authenticateAccessToken(authorization.slice(7));
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { createProtect };
