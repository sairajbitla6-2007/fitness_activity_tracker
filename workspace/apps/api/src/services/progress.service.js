const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const stepsRepository = require('../repositories/steps.repository');
const goalsService = require('./goals.service');
const { validateStepDateRange } = require('../validators/activity.validators');

async function getSummary(userId, query) {
  const timeZone = await stepsRepository.getTimeZone(pool, userId);
  if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  const today = localDateAt(new Date(), timeZone);
  const suppliedRange = {
    ...query,
    from: query.from || mondayOf(today),
    to: query.to || today,
  };
  const range = validateStepDateRange(suppliedRange, today);
  const firstUtc = localDateTimeToUtc(range.from, timeZone);
  const afterLastUtc = localDateTimeToUtc(addDays(range.to, 1), timeZone);
  const [workoutRows] = await pool.execute(
    `SELECT started_at_utc, duration_seconds
     FROM workouts
     WHERE user_id = ? AND started_at_utc >= ? AND started_at_utc < ?
     ORDER BY started_at_utc ASC`,
    [userId, toUtcSql(firstUtc), toUtcSql(afterLastUtc)],
  );
  const stepResult = await stepsRepository.listDaily(pool, userId, range);
  const stepTotals = new Map(stepResult.map((entry) => [entry.localDate, entry.steps]));
  const daily = [];
  const workoutTotals = new Map();
  for (const row of workoutRows) {
    const startedAt = row.started_at_utc instanceof Date
      ? row.started_at_utc
      : new Date(`${String(row.started_at_utc).replace(' ', 'T')}Z`);
    const localDate = localDateAt(startedAt, timeZone);
    const current = workoutTotals.get(localDate) || { workoutCount: 0, workoutSeconds: 0 };
    current.workoutCount += 1;
    current.workoutSeconds += Number(row.duration_seconds);
    workoutTotals.set(localDate, current);
  }

  let totalSteps = 0;
  let totalWorkouts = 0;
  let totalWorkoutSeconds = 0;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const workouts = workoutTotals.get(date) || { workoutCount: 0, workoutSeconds: 0 };
    const steps = stepTotals.get(date) || 0;
    const workoutMinutes = Math.floor(workouts.workoutSeconds / 60);
    daily.push({ localDate: date, steps, workoutCount: workouts.workoutCount, workoutMinutes });
    totalSteps += steps;
    totalWorkouts += workouts.workoutCount;
    totalWorkoutSeconds += workouts.workoutSeconds;
  }

  const goals = await goalsService.list(userId);
  return {
    from: range.from,
    to: range.to,
    timeZone,
    daily,
    totals: { steps: totalSteps, workoutCount: totalWorkouts, workoutMinutes: Math.floor(totalWorkoutSeconds / 60) },
    goals: goals.data.filter((goal) => goal.isActive),
  };
}

function localDateAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mondayOf(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
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

module.exports = { getSummary };
