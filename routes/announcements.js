const express = require('express');
const db = require('../db');

const router = express.Router();

const auth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// ── Public routes ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE status = 'active'
    AND start_date <= ?
    AND end_date >= ?
    ORDER BY created_at DESC
  `).all(today, today);
  res.json(announcements);
});

// ── Admin routes ──────────────────────────────────────────────────────────────

router.get('/admin/all', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM announcements ORDER BY id DESC').all());
});

router.post('/admin', auth, (req, res) => {
  const { title, message, start_date, end_date, status } = req.body;
  const result = db.prepare(`
    INSERT INTO announcements (title, message, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, message, start_date, end_date, status || 'active');

  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ann);
});

router.put('/admin/:id', auth, (req, res) => {
  const { id } = req.params;
  const { title, message, start_date, end_date, status } = req.body;

  db.prepare(`
    UPDATE announcements SET title=?, message=?, start_date=?, end_date=?, status=?
    WHERE id=?
  `).run(title, message, start_date, end_date, status, id);

  res.json(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id));
});

router.delete('/admin/:id', auth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
