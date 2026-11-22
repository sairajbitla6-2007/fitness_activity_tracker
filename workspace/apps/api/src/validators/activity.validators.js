const ApiError = require('../errors/api-error');
const { bodyObject } = require('./auth.validators');

function isLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateLocalDate(value, field = 'localDate') {
  if (!isLocalDate(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a valid YYYY-MM-DD date.`, [
      { field, message: 'Enter a valid calendar date in YYYY-MM-DD format.' },
    ]);
  }
  return value;
}

function validateDailySteps(body) {
  bodyObject(body);
  const details = [];
  if (!Number.isInteger(body.steps) || body.steps < 0 || body.steps > 1000000) {
    details.push({ field: 'steps', message: 'Steps must be a whole number from 0 to 1,000,000.' });
  }
  for (const field of Object.keys(body)) {
    if (field !== 'steps') details.push({ field, message: 'This field is not allowed.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Step entry is invalid.', details);
  return { steps: body.steps };
}

function validateStepDateRange(query, today = new Date().toISOString().slice(0, 10)) {
  const to = query.to === undefined ? today : validateLocalDate(query.to, 'to');
  const defaultFrom = new Date(`${to}T00:00:00.000Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 6);
  const from = query.from === undefined ? defaultFrom.toISOString().slice(0, 10) : validateLocalDate(query.from, 'from');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > 92) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Step date range is invalid.', [
      { field: 'from', message: 'Choose a range up to 93 days ending on or after the start date.' },
    ]);
  }
  return { from, to };
}

function validateHealthConnectSync(body, today) {
  bodyObject(body);
  const details = [];
  if (body.source !== 'health_connect') {
    details.push({ field: 'source', message: 'Only Health Connect sync is currently supported.' });
  }
  if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 93) {
    details.push({ field: 'entries', message: 'Provide between 1 and 93 daily totals.' });
  }
  const seenDates = new Set();
  const entries = Array.isArray(body.entries) ? body.entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      details.push({ field: `entries.${index}`, message: 'Each entry must be an object.' });
      return null;
    }
    const localDate = entry.localDate;
    const steps = entry.steps;
    try { validateLocalDate(localDate, `entries.${index}.localDate`); } catch (error) { details.push(...error.details); }
    if (typeof localDate === 'string') {
      if (localDate > today) details.push({ field: `entries.${index}.localDate`, message: 'Future days cannot be synced.' });
      if (isLocalDate(localDate) && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${localDate}T00:00:00Z`) > 92 * 86400000) {
        details.push({ field: `entries.${index}.localDate`, message: 'Only the most recent 93 days can be synced.' });
      }
      if (seenDates.has(localDate)) details.push({ field: `entries.${index}.localDate`, message: 'Each local date must appear once.' });
      seenDates.add(localDate);
    }
    if (!Number.isInteger(steps) || steps < 0 || steps > 1000000) {
      details.push({ field: `entries.${index}.steps`, message: 'Steps must be a whole number from 0 to 1,000,000.' });
    }
    for (const field of Object.keys(entry)) {
      if (field !== 'localDate' && field !== 'steps') details.push({ field: `entries.${index}.${field}`, message: 'This field is not allowed.' });
    }
    return { localDate, steps };
  }) : [];
  for (const field of Object.keys(body)) {
    if (field !== 'source' && field !== 'entries') details.push({ field, message: 'This field is not allowed.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Health Connect step sync is invalid.', details);
  return entries;
}

module.exports = { isLocalDate, validateLocalDate, validateDailySteps, validateStepDateRange, validateHealthConnectSync };
