const express = require('express');
const helmet = require('helmet');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const workoutRoutes = require('./routes/workouts.routes');
const stepRoutes = require('./routes/steps.routes');
const goalRoutes = require('./routes/goals.routes');
const progressRoutes = require('./routes/progress.routes');
const { rateLimit } = require('express-rate-limit');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();
const developmentOrigins = ['http://localhost:8081', 'http://127.0.0.1:8081'];
const allowedOrigins = new Set(
  (process.env.API_CORS_ORIGINS || (process.env.NODE_ENV === 'production' ? '' : developmentOrigins.join(',')))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable('x-powered-by');
app.use(helmet({ strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(!origin || allowedOrigins.has(origin) ? 204 : 403);
  }
  return next();
});
app.use(express.json({ limit: '100kb' }));
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many authentication requests. Try again later.' },
  }),
}), authRoutes);
app.use('/api/v1/me', profileRoutes);
app.use('/api/v1/workouts', workoutRoutes);
app.use('/api/v1/steps', stepRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
