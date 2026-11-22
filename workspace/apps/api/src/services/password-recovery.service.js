const bcrypt = require('bcryptjs');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const users = require('../repositories/users.repository');
const emailDelivery = require('./email-delivery.service');

const passwordCost = 12;
const tokenLifetimeMs = 30 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function requestReset(email) {
  if (!emailDelivery.isConfigured()) {
    throw new ApiError(503, 'PASSWORD_RESET_UNAVAILABLE', 'Password recovery is not configured on this server yet.');
  }

  const connection = await pool.getConnection();
  let user;
  let token;
  try {
    user = await users.findByEmail(connection, email.trim().toLowerCase());
    if (!user) return { accepted: true };

    token = randomBytes(32).toString('base64url');
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL',
      [user.id],
    );
    await connection.execute(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), user.id, hashToken(token), new Date(Date.now() + tokenLifetimeMs)],
    );
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* transaction may already be closed */ }
    throw error;
  } finally {
    connection.release();
  }

  function reportDeliveryFailure(error) {
    // Never log recipient, email body, or reset URL/token.
    console.error('Password reset email delivery failed.', {
      code: error.code || 'MAIL_DELIVERY_FAILED',
      status: error.status || undefined,
    });
  }

  // Keep the HTTP response timing similar for existing and unknown addresses.
  void emailDelivery.sendPasswordReset({ email: user.email, token }).catch(reportDeliveryFailure);
  return { accepted: true };
}

async function resetPassword({ token, password }) {
  const passwordHash = await bcrypt.hash(password, passwordCost);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, user_id, expires_at, used_at, revoked_at
       FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE`,
      [hashToken(token)],
    );
    const reset = rows[0];
    const expiresAt = reset?.expires_at instanceof Date
      ? reset.expires_at
      : reset ? new Date(`${String(reset.expires_at).replace(' ', 'T')}Z`) : null;
    if (!reset || reset.used_at || reset.revoked_at || !expiresAt || expiresAt <= new Date()) {
      await connection.rollback();
      throw new ApiError(400, 'INVALID_RESET_TOKEN', 'The reset link is invalid or expired. Request a new one.');
    }

    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
    await connection.execute(
      'UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?',
      [reset.id],
    );
    await connection.execute(
      'UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL',
      [reset.user_id, reset.id],
    );
    await connection.execute(
      'UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
      [reset.user_id],
    );
    await connection.commit();
    return { reset: true };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* transaction may already be closed */ }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { requestReset, resetPassword };
