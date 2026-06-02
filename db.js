const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL

console.log('DB URL exists:', !!connectionString)
console.log('DB URL starts with:', connectionString ? connectionString.substring(0, 30) : 'NONE')

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

pool.connect((err, client, release) => {
  if (err) {
    console.error('DB connection error:', err.message)
  } else {
    console.log('DB connected successfully!')
    release()
  }
})

module.exports = pool
