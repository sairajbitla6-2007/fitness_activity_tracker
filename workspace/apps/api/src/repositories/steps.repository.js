async function getTimeZone(connection, userId) {
  const [rows] = await connection.execute('SELECT time_zone FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows[0]?.time_zone || null;
}

async function upsertManual(connection, { id, userId, localDate, timeZone, steps }) {
  await connection.execute(
    `INSERT INTO step_entries
      (id, user_id, local_date, time_zone, source, steps, external_id, idempotency_key)
     VALUES (?, ?, ?, ?, 'manual', ?, 'manual', ?)
     ON DUPLICATE KEY UPDATE steps = VALUES(steps), time_zone = VALUES(time_zone), updated_at = CURRENT_TIMESTAMP`,
    [id, userId, localDate, timeZone, steps, `manual:${localDate}`],
  );
  const [rows] = await connection.execute(
    `SELECT local_date, time_zone, steps, source, updated_at
     FROM step_entries WHERE user_id = ? AND source = 'manual' AND local_date = ? AND external_id = 'manual' LIMIT 1`,
    [userId, localDate],
  );
  return rows[0] ? toApiEntry(rows[0]) : null;
}

async function upsertHealthConnect(connection, { id, userId, localDate, timeZone, steps }) {
  await connection.execute(
    `INSERT INTO step_entries
      (id, user_id, local_date, time_zone, source, steps, external_id, idempotency_key)
     VALUES (?, ?, ?, ?, 'health_connect', ?, ?, ?)
     ON DUPLICATE KEY UPDATE steps = VALUES(steps), time_zone = VALUES(time_zone), updated_at = CURRENT_TIMESTAMP`,
    [id, userId, localDate, timeZone, steps, `health_connect:${localDate}`, `health_connect:${localDate}`],
  );
}

async function deleteHealthConnect(connection, userId) {
  const [result] = await connection.execute(
    "DELETE FROM step_entries WHERE user_id = ? AND source = 'health_connect'",
    [userId],
  );
  return result.affectedRows;
}

async function listDaily(connection, userId, { from, to }) {
  const [rows] = await connection.execute(
    `SELECT local_date,
            CASE WHEN SUM(source = 'manual') > 0
                 THEN SUM(CASE WHEN source = 'manual' THEN steps ELSE 0 END)
                 ELSE MAX(CASE WHEN source = 'health_connect' THEN steps END) END AS steps,
            CASE WHEN SUM(source = 'manual') > 0
                 THEN SUM(source = 'manual')
                 ELSE SUM(source = 'health_connect') END AS entry_count,
            CASE WHEN SUM(source = 'manual') > 0 THEN 'manual' ELSE 'health_connect' END AS sources
     FROM step_entries
     WHERE user_id = ? AND local_date BETWEEN ? AND ?
     GROUP BY local_date ORDER BY local_date DESC`,
    [userId, from, to],
  );
  return rows.map((row) => ({
    localDate: toDateString(row.local_date),
    steps: Number(row.steps),
    entryCount: Number(row.entry_count),
    sources: row.sources ? row.sources.split(',') : [],
  }));
}

async function totalForDate(connection, userId, localDate) {
  const [rows] = await connection.execute(
    `SELECT CASE WHEN SUM(source = 'manual') > 0
                 THEN SUM(CASE WHEN source = 'manual' THEN steps ELSE 0 END)
                 ELSE MAX(CASE WHEN source = 'health_connect' THEN steps END) END AS steps
     FROM step_entries WHERE user_id = ? AND local_date = ?`,
    [userId, localDate],
  );
  return Number(rows[0]?.steps || 0);
}

function toDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toApiEntry(row) {
  return {
    localDate: toDateString(row.local_date),
    timeZone: row.time_zone,
    steps: row.steps,
    source: row.source,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

module.exports = { getTimeZone, upsertManual, upsertHealthConnect, deleteHealthConnect, listDaily, totalForDate };
