const ApiError = require('../errors/api-error');
const { bodyObject } = require('./auth.validators');

const activityTypes = new Set(['walking', 'running', 'cycling', 'strength', 'yoga', 'other']);
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseStartedAt(value, field, details) {
  if (typeof value !== 'string' || !dateTimePattern.test(value) || !Number.isFinite(Date.parse(value))) {
    details.push({ field, message: 'Use an ISO 8601 date-time with a time-zone offset.' });
    return null;
  }
  const date = new Date(value);
  if (date.getTime() > Date.now() + 5 * 60 * 1000) {
    details.push({ field, message: 'Workout start time cannot be in the future.' });
    return null;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function validateWorkoutFields(body, { partial = false, allowId = false } = {}) {
  bodyObject(body);
  const result = {};
  const details = [];
  const fields = ['activityType', 'startedAt', 'durationSeconds', 'distanceMeters', 'notes'];
  if (allowId) fields.push('id');

  if (!partial) {
    for (const field of ['activityType', 'startedAt', 'durationSeconds']) {
      if (!(field in body)) details.push({ field, message: 'This field is required.' });
    }
  }

  if ('activityType' in body) {
    if (!activityTypes.has(body.activityType)) {
      details.push({ field: 'activityType', message: 'Choose a supported activity type.' });
    } else {
      result.activityType = body.activityType;
    }
  }
  if ('id' in body) {
    if (!allowId) details.push({ field: 'id', message: 'This field is not allowed.' });
    else {
      try {
        result.id = validateWorkoutId(body.id);
      } catch (_error) {
        details.push({ field: 'id', message: 'Workout id must be a UUID.' });
      }
    }
  }
  if ('startedAt' in body) {
    const startedAt = parseStartedAt(body.startedAt, 'startedAt', details);
    if (startedAt) result.startedAt = startedAt;
  }
  if ('durationSeconds' in body) {
    if (!Number.isInteger(body.durationSeconds) || body.durationSeconds < 1 || body.durationSeconds > 86400) {
      details.push({ field: 'durationSeconds', message: 'Duration must be between 1 second and 24 hours.' });
    } else {
      result.durationSeconds = body.durationSeconds;
    }
  }
  if ('distanceMeters' in body) {
    if (body.distanceMeters !== null && (!Number.isInteger(body.distanceMeters) || body.distanceMeters < 0 || body.distanceMeters > 1000000)) {
      details.push({ field: 'distanceMeters', message: 'Distance must be a non-negative number of whole meters.' });
    } else {
      result.distanceMeters = body.distanceMeters;
    }
  }
  if ('notes' in body) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 1000)) {
      details.push({ field: 'notes', message: 'Notes must be at most 1000 characters.' });
    } else {
      result.notes = body.notes?.trim() || null;
    }
  }

  const unknownFields = Object.keys(body).filter((field) => !fields.includes(field));
  for (const field of unknownFields) details.push({ field, message: 'This field is not allowed.' });
  if (partial && !Object.keys(result).length && !details.length) {
    details.push({ field: 'body', message: 'Provide at least one workout field to update.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Some workout fields are invalid.', details);
  return result;
}

function validateWorkoutId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Workout id must be a UUID.');
  }
  return value;
}

function parseDateFilter(value, field, details) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !dateTimePattern.test(value) || !Number.isFinite(Date.parse(value))) {
    details.push({ field, message: 'Use an ISO 8601 date-time with a time-zone offset.' });
    return undefined;
  }
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function validateListQuery(query) {
  const details = [];
  const from = parseDateFilter(query.from, 'from', details);
  const to = parseDateFilter(query.to, 'to', details);
  const activityType = query.activityType;
  if (activityType !== undefined && (typeof activityType !== 'string' || !activityTypes.has(activityType))) {
    details.push({ field: 'activityType', message: 'Choose a supported activity type.' });
  }
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    details.push({ field: 'limit', message: 'Limit must be between 1 and 100.' });
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
    details.push({ field: 'offset', message: 'Offset must be between 0 and 100000.' });
  }
  if (from && to && new Date(from) > new Date(to)) {
    details.push({ field: 'from', message: 'The from date must be earlier than or equal to the to date.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Some query parameters are invalid.', details);
  return { from, to, activityType, limit, offset };
}

module.exports = { validateWorkoutFields, validateWorkoutId, validateListQuery };
