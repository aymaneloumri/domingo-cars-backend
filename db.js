'use strict';
const { Pool } = require('pg');

let pool;

if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    pool = new Pool({
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      ssl: { rejectUnauthorized: false },
      max: 10
    });
    console.log('Pool created with host:', url.hostname);
  } catch (err) {
    console.error('URL parse error:', err.message);
    console.error('DATABASE_URL value:', process.env.DATABASE_URL);
  }
} else {
  console.error('DATABASE_URL not set!');
}

module.exports = pool;
