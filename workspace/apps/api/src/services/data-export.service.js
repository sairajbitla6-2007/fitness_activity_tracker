const pool = require('../config/database');
const ApiError = require('../errors/api-error');
const dataExport = require('../repositories/data-export.repository');

async function createUserExport(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = await dataExport.findUser(connection, userId);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account is no longer available.');

    const workouts = await dataExport.listWorkouts(connection, userId);
    const steps = await dataExport.listSteps(connection, userId);
    const goals = await dataExport.listGoals(connection, userId);
    await connection.commit();

    return {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: user,
      workouts,
      stepEntries: steps,
      goals,
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createUserExport };
