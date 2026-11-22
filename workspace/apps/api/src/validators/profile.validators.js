const ApiError = require('../errors/api-error');
const { bodyObject, isTimeZone } = require('./auth.validators');

function validateProfilePatch(body) {
  bodyObject(body);
  const result = {};
  const details = [];

  if ('displayName' in body) {
    if (body.displayName !== null && (typeof body.displayName !== 'string' || body.displayName.trim().length > 100)) {
      details.push({ field: 'displayName', message: 'Display name must be at most 100 characters.' });
    } else {
      result.displayName = typeof body.displayName === 'string' ? body.displayName.trim() || null : null;
    }
  }
  if ('timeZone' in body) {
    if (typeof body.timeZone !== 'string' || body.timeZone.length > 64 || !isTimeZone(body.timeZone)) {
      details.push({ field: 'timeZone', message: 'Enter a valid IANA time zone.' });
    } else {
      result.timeZone = body.timeZone;
    }
  }
  if ('unitPreference' in body) {
    if (!['metric', 'imperial'].includes(body.unitPreference)) {
      details.push({ field: 'unitPreference', message: 'Choose metric or imperial units.' });
    } else {
      result.unitPreference = body.unitPreference;
    }
  }
  if (!Object.keys(result).length && !details.length) {
    details.push({ field: 'body', message: 'Provide at least one profile field to update.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
  return result;
}

module.exports = { validateProfilePatch };
