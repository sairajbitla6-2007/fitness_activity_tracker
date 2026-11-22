const express = require('express');
const requireAuth = require('../middleware/require-auth');
const workouts = require('../services/workouts.service');
const {
  validateWorkoutFields,
  validateWorkoutId,
  validateListQuery,
} = require('../validators/workout.validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.status(200).json(await workouts.list(req.auth.userId, validateListQuery(req.query)));
});

router.post('/', async (req, res) => {
  const fields = validateWorkoutFields(req.body, { allowId: true });
  res.status(201).json(await workouts.create(req.auth.userId, fields));
});

router.get('/:id', async (req, res) => {
  const id = validateWorkoutId(req.params.id);
  res.status(200).json(await workouts.get(req.auth.userId, id));
});

router.patch('/:id', async (req, res) => {
  const id = validateWorkoutId(req.params.id);
  const fields = validateWorkoutFields(req.body, { partial: true });
  res.status(200).json(await workouts.update(req.auth.userId, id, fields));
});

router.delete('/:id', async (req, res) => {
  const id = validateWorkoutId(req.params.id);
  await workouts.remove(req.auth.userId, id);
  res.status(204).end();
});

module.exports = router;
