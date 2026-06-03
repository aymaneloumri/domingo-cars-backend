const express = require('express')
const router = express.Router()
const pool = require('../db')

const auth = (req) =>
  req.headers['x-admin-token'] === (process.env.ADMIN_PASSWORD || 'domingo2024')

// GET all alerts
router.get('/', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const result = await pool.query('SELECT * FROM alerts ORDER BY end_date ASC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST create alert
router.post('/', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { title, type, end_date, notes } = req.body
    const result = await pool.query(
      `INSERT INTO alerts (title, type, end_date, notes, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      [title, type || 'autre', end_date, notes || '']
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT update alert
router.put('/:id', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { title, type, end_date, notes } = req.body
    await pool.query(
      `UPDATE alerts SET title=$1, type=$2, end_date=$3, notes=$4 WHERE id=$5`,
      [title, type, end_date, notes, req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT resolve alert
router.put('/:id/resolve', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { resolved_note } = req.body
    const now = new Date().toISOString().slice(0, 10)
    await pool.query(
      `UPDATE alerts SET status='resolved', resolved_at=$1, resolved_note=$2 WHERE id=$3`,
      [now, resolved_note || 'Tâche accomplie', req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT reactivate alert
router.put('/:id/reactivate', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    await pool.query(
      `UPDATE alerts SET status='active', resolved_at=NULL, resolved_note=NULL WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE alert
router.delete('/:id', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    await pool.query('DELETE FROM alerts WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
