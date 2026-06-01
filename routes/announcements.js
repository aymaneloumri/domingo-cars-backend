const express = require('express');
const pool = require('../db');

const router = express.Router();

const auth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// ── Public routes ─────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM announcements
       WHERE status = 'active' AND start_date <= $1 AND end_date >= $1
       ORDER BY created_at DESC`,
      [today]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

router.get('/admin/all', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', auth, async (req, res) => {
  try {
    const { title, message, start_date, end_date, status } = req.body;
    const result = await pool.query(
      `INSERT INTO announcements (title, message, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, message, start_date, end_date, status || 'active']
    );
    const ann = await pool.query('SELECT * FROM announcements WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(ann.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, start_date, end_date, status } = req.body;
    await pool.query(
      `UPDATE announcements SET title=$1, message=$2, start_date=$3, end_date=$4, status=$5
       WHERE id=$6`,
      [title, message, start_date, end_date, status, id]
    );
    const ann = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
    res.json(ann.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
