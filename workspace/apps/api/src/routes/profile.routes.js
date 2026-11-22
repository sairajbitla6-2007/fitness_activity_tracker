const express = require('express');
const requireAuth = require('../middleware/require-auth');
const profile = require('../services/profile.service');
const dataExport = require('../services/data-export.service');
const auth = require('../services/auth.service');
const { validateCurrentPassword } = require('../validators/auth.validators');
const { validateProfilePatch } = require('../validators/profile.validators');

const router = express.Router();
router.use(requireAuth);

router.get('/export', async (req, res) => {
  const result = await dataExport.createUserExport(req.auth.userId);
  res.set('Cache-Control', 'no-store');
  res.status(200).json(result);
});

router.get('/', async (req, res) => {
  res.status(200).json(await profile.getProfile(req.auth.userId));
});

router.patch('/', async (req, res) => {
  const changes = validateProfilePatch(req.body);
  res.status(200).json(await profile.updateProfile(req.auth.userId, changes));
});

router.delete('/', async (req, res) => {
  const { password } = validateCurrentPassword(req.body);
  await auth.deleteAccount(req.auth.userId, password);
  res.status(204).end();
});

module.exports = router;
