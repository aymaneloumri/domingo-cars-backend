const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const publicRouter = express.Router();
const adminRouter = express.Router();

// ── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/cars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'car_' + Date.now() + ext);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non supporté'));
  },
});

// ── Public routes ────────────────────────────────────────────────────────────

publicRouter.get('/cars', (req, res) => {
  const cars = db.prepare("SELECT * FROM cars WHERE status = 'active' ORDER BY sort_order ASC, id ASC").all();
  res.json(cars);
});

publicRouter.get('/cars/:id/availability', (req, res) => {
  const { id } = req.params;
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });

  const conflict = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE car_id = ? AND status != 'cancelled'
    AND NOT (end_date < ? OR start_date > ?)
  `).get(id, start, end);

  res.json({ available: conflict.count === 0 });
});

// ── Admin routes ─────────────────────────────────────────────────────────────

// Upload photo (must be before /:id routes)
adminRouter.post('/cars/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  res.json({ url: '/uploads/cars/' + req.file.filename });
});

adminRouter.get('/cars', (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY sort_order ASC, id ASC').all());
});


adminRouter.post('/cars', (req, res) => {
  const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM cars').get().next;
  const result = db.prepare(`
    INSERT INTO cars (name, category, price_per_day, image_url, description, matricule, status, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, price_per_day, image_url || '', description || '', matricule || '', status || 'active', maxOrder);

  res.status(201).json(db.prepare('SELECT * FROM cars WHERE id = ?').get(result.lastInsertRowid));
});

adminRouter.put('/cars/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
  db.prepare(`
    UPDATE cars SET name=?, category=?, price_per_day=?, image_url=?, description=?, matricule=?, status=?
    WHERE id=?
  `).run(name, category, price_per_day, image_url || '', description || '', matricule || '', status, id);

  res.json(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
});

adminRouter.delete('/cars/:id', (req, res) => {
  const { id } = req.params;
  const car = db.prepare('SELECT image_url FROM cars WHERE id = ?').get(id);

  // Delete uploaded file if it lives in /uploads/
  if (car && car.image_url && car.image_url.startsWith('/uploads/cars/')) {
    const filePath = path.join(__dirname, '..', car.image_url);
    fs.unlink(filePath, () => {}); // silent — file may already be gone
  }

  db.prepare('DELETE FROM cars WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = { publicRouter, adminRouter };
