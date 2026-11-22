const express = require('express');
const requireAuth = require('../middleware/require-auth');
const steps = require('../services/steps.service');
const { validateDailySteps, validateLocalDate, validateHealthConnectSync } = require('../validators/activity.validators');

const router = express.Router();
router.use(requireAuth);

router.get('/daily', async (req, res) => {
  res.status(200).json(await steps.listDaily(req.auth.userId, req.query));
});

router.put('/daily/:localDate', async (req, res) => {
  const localDate = validateLocalDate(req.params.localDate);
  res.status(200).json(await steps.upsertManual(req.auth.userId, localDate, validateDailySteps(req.body)));
});

router.post('/sync', async (req, res) => {
  const today = await steps.localToday(req.auth.userId);
  const entries = validateHealthConnectSync(req.body, today);
  res.status(200).json(await steps.syncHealthConnect(req.auth.userId, entries));
});

router.delete('/sync', async (req, res) => {
  await steps.disconnectHealthConnect(req.auth.userId);
  res.status(204).end();
});

module.exports = router;
