function timestamp(value) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? null : new Date(`${String(value).replace(' ', 'T').replace(/Z?$/, 'Z')}`).toISOString();
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function findUser(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, email, display_name, time_zone, unit_preference, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timeZone: user.time_zone,
    unitPreference: user.unit_preference,
    createdAt: timestamp(user.created_at),
  };
}

async function listWorkouts(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, activity_type, started_at_utc, duration_seconds, distance_meters,
            notes, source, created_at, updated_at
     FROM workouts WHERE user_id = ? ORDER BY started_at_utc ASC, id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    activityType: row.activity_type,
    startedAt: timestamp(row.started_at_utc),
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    notes: row.notes,
    source: row.source,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }));
}

async function listSteps(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, local_date, time_zone, source, steps, external_id, created_at, updated_at
     FROM step_entries WHERE user_id = ? ORDER BY local_date ASC, source ASC, id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    localDate: dateOnly(row.local_date),
    timeZone: row.time_zone,
    source: row.source,
    steps: Number(row.steps),
    externalId: row.external_id,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }));
}

async function listGoals(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, goal_type, target_value, period,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on,
            is_active, created_at, updated_at
     FROM goals WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    goalType: row.goal_type,
    targetValue: row.target_value,
    period: row.period,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: Boolean(row.is_active),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }));
}

module.exports = { findUser, listWorkouts, listSteps, listGoals };
