const { randomUUID } = require('node:crypto');
const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const steps = require('../repositories/steps.repository');
const { validateStepDateRange } = require('../validators/activity.validators');

async function upsertManual(userId, localDate, fields) {
  const timeZone = await steps.getTimeZone(pool, userId);
  if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  return steps.upsertManual(pool, { id: randomUUID(), userId, localDate, timeZone, ...fields });
}

async function listDaily(userId, query) {
  const timeZone = await steps.getTimeZone(pool, userId);
  if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  const localToday = localDateAt(new Date(), timeZone);
  const range = validateStepDateRange(query, localToday);
  return { data: await steps.listDaily(pool, userId, range), range, timeZone };
}

async function localToday(userId) {
  const timeZone = await steps.getTimeZone(pool, userId);
  if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
  return localDateAt(new Date(), timeZone);
}

async function syncHealthConnect(userId, entries) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const timeZone = await steps.getTimeZone(connection, userId);
    if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
    for (const entry of entries) {
      await steps.upsertHealthConnect(connection, { id: randomUUID(), userId, timeZone, ...entry });
    }
    await connection.commit();
    return { source: 'health_connect', data: entries };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function disconnectHealthConnect(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const timeZone = await steps.getTimeZone(connection, userId);
    if (!timeZone) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');
    const deletedCount = await steps.deleteHealthConnect(connection, userId);
    await connection.commit();
    return { deletedCount };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

function localDateAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = { upsertManual, listDaily, localToday, syncHealthConnect, disconnectHealthConnect };
