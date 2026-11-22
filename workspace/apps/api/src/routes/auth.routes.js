const express = require('express');
const { rateLimit } = require('express-rate-limit');
const auth = require('../services/auth.service');
const passwordRecovery = require('../services/password-recovery.service');
const {
  validateCredentials,
  validateRefreshToken,
  validatePasswordResetRequest,
  validatePasswordReset,
} = require('../validators/auth.validators');

const router = express.Router();
const resetRequestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many password reset requests. Try again later.' },
  }),
});
const resetPasswordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many password reset attempts. Try again later.' },
  }),
});

router.post('/register', async (req, res) => {
  const credentials = validateCredentials(req.body, true);
  const session = await auth.register(credentials);
  res.status(201).json(session);
});

router.post('/login', async (req, res) => {
  const credentials = validateCredentials(req.body);
  const session = await auth.login(credentials);
  res.status(200).json(session);
});

router.post('/refresh', async (req, res) => {
  const refreshToken = validateRefreshToken(req.body);
  const session = await auth.refresh(refreshToken);
  res.status(200).json(session);
});

router.post('/logout', async (req, res) => {
  const refreshToken = validateRefreshToken(req.body);
  await auth.logout(refreshToken);
  res.status(204).end();
});

router.post('/password-reset/request', resetRequestLimit, async (req, res) => {
  const email = validatePasswordResetRequest(req.body);
  await passwordRecovery.requestReset(email);
  res.status(202).json({ message: 'If an account uses that email, password reset instructions will be sent.' });
});

router.post('/password-reset/confirm', resetPasswordLimit, async (req, res) => {
  await passwordRecovery.resetPassword(validatePasswordReset(req.body));
  res.status(200).json({ message: 'Password updated. Sign in with your new password.' });
});

module.exports = router;
