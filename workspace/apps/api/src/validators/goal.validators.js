const ApiError = require('../errors/api-error');
const { bodyObject } = require('./auth.validators');
const { isLocalDate, validateLocalDate } = require('./activity.validators');

const goalRules = {
  daily_steps: { period: 'day', max: 1000000 },
  weekly_workouts: { period: 'week', max: 100 },
  weekly_workout_minutes: { period: 'week', max: 10080 },
};

function validateGoalFields(body, { partial = false } = {}) {
  bodyObject(body);
  const details = [];
  const result = {};
  const allowed = ['goalType', 'targetValue', 'startsOn', 'endsOn', 'isActive'];
  if (!partial) {
    for (const field of ['goalType', 'targetValue', 'startsOn']) {
      if (!(field in body)) details.push({ field, message: 'This field is required.' });
    }
  }
  if ('goalType' in body) {
    if (!Object.hasOwn(goalRules, body.goalType)) details.push({ field: 'goalType', message: 'Choose a supported goal type.' });
    else result.goalType = body.goalType;
  }
  const type = body.goalType || null;
  if ('targetValue' in body) {
    const max = goalRules[type]?.max || 1000000;
    if (!Number.isInteger(body.targetValue) || body.targetValue < 1 || body.targetValue > max) {
      details.push({ field: 'targetValue', message: `Target must be a whole number from 1 to ${max}.` });
    } else result.targetValue = body.targetValue;
  }
  if ('startsOn' in body) {
    if (!isLocalDate(body.startsOn)) details.push({ field: 'startsOn', message: 'Enter a valid YYYY-MM-DD date.' });
    else result.startsOn = validateLocalDate(body.startsOn, 'startsOn');
  }
  if ('endsOn' in body) {
    if (body.endsOn !== null && !isLocalDate(body.endsOn)) details.push({ field: 'endsOn', message: 'Enter a valid YYYY-MM-DD date or null.' });
    else result.endsOn = body.endsOn === null ? null : validateLocalDate(body.endsOn, 'endsOn');
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') details.push({ field: 'isActive', message: 'isActive must be true or false.' });
    else result.isActive = body.isActive;
  }
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) details.push({ field, message: 'This field is not allowed.' });
  }
  const typeForRules = result.goalType || type;
  if (typeForRules && result.goalType && ('targetValue' in body)) {
    const max = goalRules[typeForRules].max;
    if (body.targetValue > max) details.push({ field: 'targetValue', message: `Target must not exceed ${max} for this goal type.` });
  }
  const startsOn = result.startsOn || body.startsOn;
  const endsOn = result.endsOn !== undefined ? result.endsOn : body.endsOn;
  if (startsOn && endsOn && endsOn < startsOn) details.push({ field: 'endsOn', message: 'End date must be on or after the start date.' });
  if (partial && Object.keys(result).length === 0 && details.length === 0) {
    details.push({ field: 'body', message: 'Provide at least one goal field to update.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Goal fields are invalid.', details);
  return result;
}

function validateGoalId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Goal id must be a UUID.');
  }
  return value;
}

module.exports = { goalRules, validateGoalFields, validateGoalId };
