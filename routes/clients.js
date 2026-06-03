const express = require('express')
const router = express.Router()
const pool = require('../db')

const auth = (req) =>
  req.headers['x-admin-token'] === (process.env.ADMIN_PASSWORD || 'domingo2024')

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
