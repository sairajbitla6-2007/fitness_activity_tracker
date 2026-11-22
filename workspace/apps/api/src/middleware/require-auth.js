const ApiError = require('../errors/api-error');
const { verifyAccessToken } = require('../services/tokens');

function requireAuth(req, _res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'A valid access token is required.'));
  }

  try {
    const claims = verifyAccessToken(match[1]);
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw new Error('Token subject is missing.');
    }
    req.auth = { userId: claims.sub };
    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'UNAUTHORIZED', 'A valid access token is required.'));
  }
}

module.exports = requireAuth;
