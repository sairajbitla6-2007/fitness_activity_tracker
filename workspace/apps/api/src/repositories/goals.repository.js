async function listByUser(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, goal_type, target_value, period,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on,
            is_active, created_at, updated_at
     FROM goals WHERE user_id = ?
     ORDER BY is_active DESC, created_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map(toApiGoal);
}

async function create(connection, goal) {
  await connection.execute(
    `INSERT INTO goals (id, user_id, goal_type, target_value, period, starts_on, ends_on, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [goal.id, goal.userId, goal.goalType, goal.targetValue, goal.period, goal.startsOn, goal.endsOn ?? null],
  );
  const [rows] = await connection.execute(
    `SELECT id, goal_type, target_value, period,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on,
            is_active, created_at, updated_at
     FROM goals WHERE user_id = ? AND id = ? LIMIT 1`,
    [goal.userId, goal.id],
  );
  return rows[0] ? toApiGoal(rows[0]) : null;
}

async function update(connection, userId, id, changes) {
  const columns = { targetValue: 'target_value', startsOn: 'starts_on', endsOn: 'ends_on', isActive: 'is_active' };
  const entries = Object.entries(changes);
  const assignments = entries.map(([field]) => `${columns[field]} = ?`).join(', ');
  if (assignments) {
    await connection.execute(
      `UPDATE goals SET ${assignments} WHERE user_id = ? AND id = ?`,
      [...entries.map(([, value]) => value), userId, id],
    );
  }
  const [rows] = await connection.execute(
    `SELECT id, goal_type, target_value, period,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on,
            is_active, created_at, updated_at
     FROM goals WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  return rows[0] ? toApiGoal(rows[0]) : null;
}

function toApiGoal(row) {
  return {
    id: row.id,
    goalType: row.goal_type,
    targetValue: row.target_value,
    period: row.period,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

module.exports = { listByUser, create, update };
