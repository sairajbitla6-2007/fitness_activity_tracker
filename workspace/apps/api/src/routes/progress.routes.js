const express = require('express');
const requireAuth = require('../middleware/require-auth');
const progress = require('../services/progress.service');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', async (req, res) => {
  res.status(200).json(await progress.getSummary(req.auth.userId, req.query));
});

module.exports = router;
