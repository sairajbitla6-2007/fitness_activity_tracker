const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function readPort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

module.exports = {
  apiPort: readPort(process.env.API_PORT, 3000),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: readPort(process.env.MYSQL_PORT, 3306),
    database: process.env.MYSQL_DATABASE || 'fitness_tracker',
    user: process.env.MYSQL_USER || 'fitness_app',
    password: process.env.MYSQL_PASSWORD || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: readPort(process.env.SMTP_PORT, process.env.SMTP_SECURE === 'true' ? 465 : 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false' && process.env.SMTP_SECURE !== 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM_EMAIL || '',
    resetScheme: process.env.PASSWORD_RESET_APP_SCHEME || 'fitness-tracker',
  },
};
