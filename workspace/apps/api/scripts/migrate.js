const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../src/config/database');

const migrationsDirectory = path.resolve(__dirname, '../../../database/migrations');

async function run() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.filename));
    const filenames = (await fs.readdir(migrationsDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();

    for (const filename of filenames) {
      if (applied.has(filename)) continue;
      const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
      const statements = sql
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);

      console.log(`Applying ${filename}`);
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
    }

    console.log('Database migrations are up to date.');
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
