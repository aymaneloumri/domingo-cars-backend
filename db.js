'use strict';
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;
console.log('RAW URL:', dbUrl);

let pool;

try {
  // Decode percent-encoded characters in password
  const url = new URL(dbUrl);
  const config = {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
    max: 10
  };
  console.log('Host:', config.host);
  console.log('User:', config.user);
  console.log('DB:', config.database);
  pool = new Pool(config);
  console.log('Pool created successfully');
} catch (err) {
  console.error('POOL CREATION FAILED:', err.message);
  console.error('Stack:', err.stack);
}

module.exports = pool;
