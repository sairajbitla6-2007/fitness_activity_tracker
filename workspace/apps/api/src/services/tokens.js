const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const ApiError = require('../errors/api-error');

const issuer = 'fitness-activity-tracker-api';
const audience = 'fitness-activity-tracker-mobile';
const refreshLifetimeDays = 30;

function accessSecret() {
  const secret = process.env.AUTH_ACCESS_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on the server.');
  }
  return secret;
}

function createAccessToken(userId) {
  return jwt.sign({}, accessSecret(), {
    algorithm: 'HS256',
    subject: userId,
    issuer,
    audience,
    expiresIn: '15m',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret(), {
    algorithms: ['HS256'],
    issuer,
    audience,
  });
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiry() {
  return new Date(Date.now() + refreshLifetimeDays * 24 * 60 * 60 * 1000);
}

module.exports = {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  hashRefreshToken,
  refreshExpiry,
};
