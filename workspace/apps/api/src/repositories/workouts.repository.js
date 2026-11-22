function toApiWorkout(row) {
  const startedAt = row.started_at_utc instanceof Date
    ? row.started_at_utc
    : new Date(`${String(row.started_at_utc).replace(' ', 'T').replace(/Z?$/, 'Z')}`);

  return {
    id: row.id,
    activityType: row.activity_type,
    startedAt: startedAt.toISOString(),
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    notes: row.notes,
    source: row.source,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function listByUser(connection, userId, { from, to, activityType, limit, offset }) {
  const conditions = ['user_id = ?'];
  const values = [userId];
  if (from) {
    conditions.push('started_at_utc >= ?');
    values.push(from);
  }
  if (to) {
    conditions.push('started_at_utc <= ?');
    values.push(to);
  }
  if (activityType) {
    conditions.push('activity_type = ?');
    values.push(activityType);
  }
  values.push(limit, offset);

  const [rows] = await connection.execute(
    `SELECT id, activity_type, started_at_utc, duration_seconds, distance_meters,
            notes, source, created_at, updated_at
     FROM workouts WHERE ${conditions.join(' AND ')}
     ORDER BY started_at_utc DESC, id DESC LIMIT ? OFFSET ?`,
    values,
  );
  return rows.map(toApiWorkout);
}

async function findById(connection, userId, id) {
  const [rows] = await connection.execute(
    `SELECT id, activity_type, started_at_utc, duration_seconds, distance_meters,
            notes, source, created_at, updated_at
     FROM workouts WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  return rows[0] ? toApiWorkout(rows[0]) : null;
}

async function create(connection, workout) {
  await connection.execute(
    `INSERT INTO workouts
      (id, user_id, activity_type, started_at_utc, duration_seconds, distance_meters, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
    [
      workout.id,
      workout.userId,
      workout.activityType,
      workout.startedAt,
      workout.durationSeconds,
      workout.distanceMeters,
      workout.notes,
    ],
  );
  return findById(connection, workout.userId, workout.id);
}

async function update(connection, userId, id, workout) {
  const columns = {
    activityType: 'activity_type',
    startedAt: 'started_at_utc',
    durationSeconds: 'duration_seconds',
    distanceMeters: 'distance_meters',
    notes: 'notes',
  };
  const updates = Object.entries(workout);
  const assignments = updates.map(([field]) => `${columns[field]} = ?`).join(', ');
  const values = updates.map(([, value]) => value);
  await connection.execute(
    `UPDATE workouts SET ${assignments} WHERE user_id = ? AND id = ?`,
    [...values, userId, id],
  );
  return findById(connection, userId, id);
}

async function remove(connection, userId, id) {
  const [result] = await connection.execute(
    'DELETE FROM workouts WHERE user_id = ? AND id = ?',
    [userId, id],
  );
  return result.affectedRows > 0;
}

module.exports = { listByUser, findById, create, update, remove };
