const { randomUUID } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const workouts = require('../repositories/workouts.repository');

async function list(userId, options) {
  const data = await workouts.listByUser(pool, userId, options);
  return {
    data,
    pagination: { limit: options.limit, offset: options.offset },
  };
}

async function get(userId, id) {
  const workout = await workouts.findById(pool, userId, id);
  if (!workout) throw new ApiError(404, 'WORKOUT_NOT_FOUND', 'Workout was not found.');
  return workout;
}

async function create(userId, fields) {
  const { id: requestedId, ...workoutFields } = fields;
  const id = requestedId || randomUUID();
  if (requestedId) {
    const existing = await workouts.findById(pool, userId, id);
    if (existing) {
      if (sameWorkout(existing, workoutFields)) return existing;
      throw new ApiError(409, 'WORKOUT_ID_CONFLICT', 'This workout id is already used for a different entry.');
    }
  }
  try {
    return await workouts.create(pool, { id, userId, ...workoutFields });
  } catch (error) {
    if (requestedId && error.code === 'ER_DUP_ENTRY') {
      const existing = await workouts.findById(pool, userId, id);
      if (existing && sameWorkout(existing, workoutFields)) return existing;
      throw new ApiError(409, 'WORKOUT_ID_CONFLICT', 'This workout id is already in use.');
    }
    throw error;
  }
}

function sameWorkout(existing, fields) {
  const startedAt = new Date(`${fields.startedAt.replace(' ', 'T')}Z`).toISOString();
  return existing.activityType === fields.activityType
    && existing.startedAt === startedAt
    && existing.durationSeconds === fields.durationSeconds
    && existing.distanceMeters === fields.distanceMeters
    && existing.notes === fields.notes;
}

async function update(userId, id, fields) {
  const workout = await workouts.update(pool, userId, id, fields);
  if (!workout) throw new ApiError(404, 'WORKOUT_NOT_FOUND', 'Workout was not found.');
  return workout;
}

async function remove(userId, id) {
  const deleted = await workouts.remove(pool, userId, id);
  if (!deleted) throw new ApiError(404, 'WORKOUT_NOT_FOUND', 'Workout was not found.');
}

module.exports = { list, get, create, update, remove };
