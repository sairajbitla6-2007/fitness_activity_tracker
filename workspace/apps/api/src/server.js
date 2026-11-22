const app = require('./app');
const pool = require('./config/database');
const { apiPort } = require('./config/env');

const apiHost = process.env.API_HOST || '0.0.0.0';
const server = app.listen(apiPort, apiHost, () => {
  console.log(`Fitness Activity Tracker API listening on ${apiHost}:${apiPort}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down API.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
