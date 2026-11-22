const ApiError = require('../errors/api-error');

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A JSON object is required.');
  }
  return body;
}

function validateCredentials(body, includeProfile = false) {
  bodyObject(body);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password;
  const details = [];

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    details.push({ field: 'email', message: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    details.push({ field: 'password', message: 'Use a password of at least 12 characters and no more than 72 UTF-8 bytes.' });
  }

  const result = { email, password };
  if (includeProfile) {
    const displayName = body.displayName === undefined ? null : body.displayName;
    const timeZone = body.timeZone === undefined ? 'UTC' : body.timeZone;
    if (displayName !== null && (typeof displayName !== 'string' || displayName.trim().length > 100)) {
      details.push({ field: 'displayName', message: 'Display name must be at most 100 characters.' });
    }
    if (typeof timeZone !== 'string' || timeZone.length > 64 || !isTimeZone(timeZone)) {
      details.push({ field: 'timeZone', message: 'Enter a valid IANA time zone.' });
    }
    result.displayName = displayName;
    result.timeZone = timeZone;
  }

  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
  return result;
}

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (_error) {
    return false;
  }
}

function validateRefreshToken(body) {
  bodyObject(body);
  if (typeof body.refreshToken !== 'string' || body.refreshToken.length < 40 || body.refreshToken.length > 200) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A valid refreshToken is required.', [
      { field: 'refreshToken', message: 'Refresh token is required.' },
    ]);
  }
  return body.refreshToken;
}

function validateCurrentPassword(body) {
  bodyObject(body);
  const details = [];
  if (typeof body.password !== 'string' || body.password.length === 0 || Buffer.byteLength(body.password, 'utf8') > 72) {
    details.push({ field: 'password', message: 'Enter your current password.' });
  }
  for (const field of Object.keys(body)) {
    if (field !== 'password') details.push({ field, message: 'This field is not allowed.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Account deletion request is invalid.', details);
  return { password: body.password };
}

function validatePasswordResetRequest(body) {
  bodyObject(body);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid email address.', [
      { field: 'email', message: 'Enter a valid email address.' },
    ]);
  }
  return email;
}

function validatePasswordReset(body) {
  bodyObject(body);
  const token = body.token;
  const password = body.password;
  const details = [];
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    details.push({ field: 'token', message: 'The reset link is invalid or expired.' });
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    details.push({ field: 'password', message: 'Use a password of at least 12 characters and no more than 72 UTF-8 bytes.' });
  }
  if (details.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
  return { token, password };
}

module.exports = {
  validateCredentials,
  validateRefreshToken,
  validateCurrentPassword,
  validatePasswordResetRequest,
  validatePasswordReset,
  bodyObject,
  isTimeZone,
};
