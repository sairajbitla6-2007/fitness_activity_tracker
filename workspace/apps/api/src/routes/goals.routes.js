const express = require('express');
const requireAuth = require('../middleware/require-auth');
const goals = require('../services/goals.service');
const { validateGoalFields, validateGoalId } = require('../validators/goal.validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.status(200).json(await goals.list(req.auth.userId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await goals.create(req.auth.userId, validateGoalFields(req.body)));
});

router.patch('/:id', async (req, res) => {
  const id = validateGoalId(req.params.id);
  res.status(200).json(await goals.update(req.auth.userId, id, validateGoalFields(req.body, { partial: true })));
});

module.exports = router;
