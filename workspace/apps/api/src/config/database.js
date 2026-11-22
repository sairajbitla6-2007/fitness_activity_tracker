const mysql = require('mysql2/promise');
const { mysql: config } = require('./env');

const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 60000,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
});

module.exports = pool;
