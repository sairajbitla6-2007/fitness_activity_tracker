const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const users = require('../repositories/users.repository');
const {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  refreshExpiry,
} = require('./tokens');

const passwordCost = 12;
let dummyHashPromise;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timeZone: user.time_zone,
    unitPreference: user.unit_preference,
  };
}

async function saveRefreshSession(connection, userId, refreshToken) {
  await connection.execute(
    'INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), userId, hashRefreshToken(refreshToken), refreshExpiry()],
  );
}

async function createSession(connection, user) {
  const refreshToken = createRefreshToken();
  await saveRefreshSession(connection, user.id, refreshToken);
  return {
    user: publicUser(user),
    accessToken: createAccessToken(user.id),
    refreshToken,
  };
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function register({ email, password, displayName, timeZone }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, passwordCost);
  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    passwordHash,
    displayName: displayName?.trim() || null,
    timeZone: timeZone || 'UTC',
  };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await users.create(connection, user);
    const session = await createSession(connection, {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      time_zone: user.timeZone,
      unit_preference: 'metric',
    });
    await connection.commit();
    return session;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // The connection may have failed before the transaction began.
    }
    if (error.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function login({ email, password }) {
  const connection = await pool.getConnection();
  try {
    const user = await users.findByEmail(connection, normalizeEmail(email));
    if (!user) {
      dummyHashPromise ||= bcrypt.hash('not-a-real-user-password', passwordCost);
      await bcrypt.compare(password, await dummyHashPromise);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    return createSession(connection, user);
  } finally {
    connection.release();
  }
}

async function refresh(refreshToken) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_sessions WHERE token_hash = ? FOR UPDATE`,
      [hashRefreshToken(refreshToken)],
    );
    const session = rows[0];

    if (!session) {
      await connection.rollback();
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    if (session.revoked_at) {
      // Reuse of a rotated token may indicate theft; revoke the user's remaining sessions.
      await connection.execute(
        'UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
        [session.user_id],
      );
      await connection.commit();
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const expiresAt = session.expires_at instanceof Date
      ? session.expires_at
      : new Date(`${String(session.expires_at).replace(' ', 'T')}Z`);
    if (expiresAt <= new Date()) {
      await connection.execute(
        'UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?',
        [session.id],
      );
      await connection.commit();
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const user = await users.findById(connection, session.user_id);
    if (!user) {
      await connection.rollback();
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const nextRefreshToken = createRefreshToken();
    await connection.execute(
      'UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL',
      [session.id],
    );
    await saveRefreshSession(connection, user.id, nextRefreshToken);
    const result = {
      user: publicUser(user),
      accessToken: createAccessToken(user.id),
      refreshToken: nextRefreshToken,
    };
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // The transaction may already have been committed or rolled back.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function logout(refreshToken) {
  await pool.execute(
    `UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP()
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashRefreshToken(refreshToken)],
  );
}

async function deleteAccount(userId, password) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT password_hash FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    const user = rows[0];
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { register, login, refresh, logout, deleteAccount };
