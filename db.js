const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set!')
}

console.log('Connecting to DB:', process.env.DATABASE_URL ? 'URL found' : 'NO URL')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

pool.on('error', (err) => {
  console.error('DB Pool error:', err.message)
})

module.exports = pool
