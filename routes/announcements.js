const express = require('express');
const db = require('../db');

const publicRouter = express.Router();
const adminRouter = express.Router();

// PUBLIC: active announcements within current date range
publicRouter.get('/announcements', (req, res) => {
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

// ADMIN: all announcements
adminRouter.get('/announcements', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  res.json(announcements);
});

// ADMIN: create announcement
adminRouter.post('/announcements', (req, res) => {
  const { title, message, start_date, end_date, status } = req.body;
  const result = db.prepare(`
    INSERT INTO announcements (title, message, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, message, start_date, end_date, status || 'active');

  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ann);
});

// ADMIN: update announcement
adminRouter.put('/announcements/:id', (req, res) => {
  const { id } = req.params;
  const { title, message, start_date, end_date, status } = req.body;

  db.prepare(`
    UPDATE announcements SET title=?, message=?, start_date=?, end_date=?, status=?
    WHERE id=?
  `).run(title, message, start_date, end_date, status, id);

  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.json(ann);
});

// ADMIN: delete announcement
adminRouter.delete('/announcements/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = { publicRouter, adminRouter };
