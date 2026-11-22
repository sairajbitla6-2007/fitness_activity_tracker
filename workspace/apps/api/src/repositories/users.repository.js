async function findByEmail(connection, email) {
  const [rows] = await connection.execute(
    `SELECT id, email, password_hash, display_name, time_zone, unit_preference
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function findById(connection, id) {
  const [rows] = await connection.execute(
    `SELECT id, email, display_name, time_zone, unit_preference, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create(connection, user) {
  await connection.execute(
    `INSERT INTO users (id, email, password_hash, display_name, time_zone)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.email, user.passwordHash, user.displayName, user.timeZone],
  );
}

async function updateProfile(connection, id, profile) {
  const columns = {
    displayName: 'display_name',
    timeZone: 'time_zone',
    unitPreference: 'unit_preference',
  };
  const updates = Object.entries(profile);
  const assignments = updates.map(([field]) => `${columns[field]} = ?`).join(', ');
  const values = updates.map(([, value]) => value);
  await connection.execute(`UPDATE users SET ${assignments} WHERE id = ?`, [...values, id]);
  return findById(connection, id);
}

module.exports = { findByEmail, findById, create, updateProfile };
