const { randomUUID } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const goals = require('../repositories/goals.repository');
const steps = require('../repositories/steps.repository');
const { goalRules } = require('../validators/goal.validators');

async function list(userId) {
  const [users] = await pool.execute('SELECT time_zone FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!users[0]) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  const timeZone = users[0].time_zone;
  const today = localDateAt(new Date(), timeZone);
  const goalRows = await goals.listByUser(pool, userId);
  const data = [];
  for (const goal of goalRows) {
    const eligible = goal.isActive && goal.startsOn <= today && (!goal.endsOn || goal.endsOn >= today);
    const progress = eligible ? await getProgress(userId, goal, today, timeZone) : 0;
    data.push({ ...goal, progress, isComplete: progress >= goal.targetValue });
  }
  return { data, localDate: today, timeZone };
}

async function create(userId, fields) {
  const rules = goalRules[fields.goalType];
  if (!rules || fields.targetValue > rules.max) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Target is outside the supported range for this goal type.', [
      { field: 'targetValue', message: `Target must not exceed ${rules?.max || 1000000} for this goal type.` },
    ]);
  }
  return goals.create(pool, { id: randomUUID(), userId, period: rules.period, ...fields });
}

async function update(userId, id, changes) {
  const current = await findOwned(userId, id);
  const goalType = current.goalType;
  if (changes.targetValue !== undefined && changes.targetValue > goalRules[goalType].max) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Target is outside the supported range for this goal type.', [
      { field: 'targetValue', message: `Target must not exceed ${goalRules[goalType].max} for this goal type.` },
    ]);
  }
  const startsOn = changes.startsOn || current.startsOn;
  const endsOn = changes.endsOn === undefined ? current.endsOn : changes.endsOn;
  if (endsOn && endsOn < startsOn) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Goal date range is invalid.', [
      { field: 'endsOn', message: 'End date must be on or after the start date.' },
    ]);
  }
  const updated = await goals.update(pool, userId, id, changes);
  if (!updated) throw new ApiError(404, 'GOAL_NOT_FOUND', 'Goal was not found.');
  return { ...updated, progress: 0, isComplete: false };
}

async function findOwned(userId, id) {
  const goalRows = await goals.listByUser(pool, userId);
  const goal = goalRows.find((entry) => entry.id === id);
  if (!goal) throw new ApiError(404, 'GOAL_NOT_FOUND', 'Goal was not found.');
  return goal;
}

async function getProgress(userId, goal, today, timeZone) {
  if (goal.goalType === 'daily_steps') return steps.totalForDate(pool, userId, today);
  const weekStart = mondayOf(today);
  const nextWeek = addDays(weekStart, 7);
  const fromDate = goal.startsOn > weekStart ? goal.startsOn : weekStart;
  const lastEligible = goal.endsOn && goal.endsOn < addDays(nextWeek, -1) ? addDays(goal.endsOn, 1) : nextWeek;
  const fromUtc = localDateTimeToUtc(fromDate, timeZone);
  const toUtc = localDateTimeToUtc(lastEligible, timeZone);
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS workout_count, COALESCE(SUM(duration_seconds), 0) AS duration_seconds
     FROM workouts WHERE user_id = ? AND started_at_utc >= ? AND started_at_utc < ?`,
    [userId, toUtcSql(fromUtc), toUtcSql(toUtc)],
  );
  if (goal.goalType === 'weekly_workouts') return Number(rows[0]?.workout_count || 0);
  return Math.floor(Number(rows[0]?.duration_seconds || 0) / 60);
}

function localDateAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mondayOf(date) {
  const day = new Date(`${date}T00:00:00.000Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

function addDays(date, count) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}

function localDateTimeToUtc(date, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    const observed = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    candidate += target - observed;
  }
  return new Date(candidate);
}

function toUtcSql(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { list, create, update };
