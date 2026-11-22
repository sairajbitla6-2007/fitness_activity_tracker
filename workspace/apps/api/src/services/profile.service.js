const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const users = require('../repositories/users.repository');

async function getProfile(userId) {
  const [rows] = await pool.execute(
    `SELECT id, email, display_name, time_zone, unit_preference
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  if (!rows[0]) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  return toProfile(rows[0]);
}

async function updateProfile(userId, changes) {
  const profile = await users.updateProfile(pool, userId, changes);
  if (!profile) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  return toProfile(profile);
}

function toProfile(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timeZone: user.time_zone,
    unitPreference: user.unit_preference,
  };
}

module.exports = { getProfile, updateProfile };
