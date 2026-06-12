const express = require('express')
const router = express.Router()
const pool = require('../db')

const auth = (req) =>
  req.headers['x-admin-token'] === (process.env.ADMIN_PASSWORD || 'domingo2024')

// Ensure blacklist columns exist (runs once at startup)
;(async () => {
  try {
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN DEFAULT FALSE`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS blacklist_reason TEXT`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMPTZ`)
  } catch (err) {
    console.error('Blacklist migration error:', err.message)
  }
})()

// GET /blacklisted/list — MUST come before GET /:id
router.get('/blacklisted/list', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const result = await pool.query(
      `SELECT * FROM clients WHERE blacklisted = TRUE ORDER BY blacklisted_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /:id/blacklist — MUST come before PUT /:id
router.put('/:id/blacklist', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { reason } = req.body
    await pool.query(
      `UPDATE clients SET blacklisted=TRUE, blacklist_reason=$1, blacklisted_at=NOW() WHERE id=$2`,
      [reason || null, req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /:id/unblacklist — MUST come before PUT /:id
router.put('/:id/unblacklist', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    await pool.query(
      `UPDATE clients SET blacklisted=FALSE, blacklist_reason=NULL, blacklisted_at=NULL WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { search } = req.query
    let query = 'SELECT * FROM clients ORDER BY nom_prenom ASC'
    let params = []
    if (search) {
      query = `SELECT * FROM clients
               WHERE LOWER(nom_prenom) LIKE $1
               OR LOWER(cin_passport) LIKE $1
               OR telephone LIKE $1
               ORDER BY nom_prenom ASC`
      params = [`%${search.toLowerCase()}%`]
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const result = await pool.query(
      'SELECT * FROM clients WHERE id=$1', [req.params.id]
    )
    res.json(result.rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { nom_prenom, date_naissance, telephone, cin_passport,
            cin_passport_expiry, adresse, permis, permis_expiry } = req.body
    const result = await pool.query(
      `INSERT INTO clients
       (nom_prenom, date_naissance, telephone, cin_passport,
        cin_passport_expiry, adresse, permis, permis_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [nom_prenom, date_naissance, telephone, cin_passport,
       cin_passport_expiry, adresse, permis, permis_expiry]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { nom_prenom, date_naissance, telephone, cin_passport,
            cin_passport_expiry, adresse, permis, permis_expiry } = req.body
    await pool.query(
      `UPDATE clients SET
       nom_prenom=$1, date_naissance=$2, telephone=$3,
       cin_passport=$4, cin_passport_expiry=$5, adresse=$6,
       permis=$7, permis_expiry=$8
       WHERE id=$9`,
      [nom_prenom, date_naissance, telephone, cin_passport,
       cin_passport_expiry, adresse, permis, permis_expiry, req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
