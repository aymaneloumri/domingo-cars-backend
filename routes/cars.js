const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const db = require('../db');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non supporté'));
  },
});

const auth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// ── Public routes ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const cars = db.prepare("SELECT * FROM cars WHERE status = 'active' ORDER BY sort_order ASC, id ASC").all();
  res.json(cars);
});

router.get('/:id/availability', (req, res) => {
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

// ── Admin routes ──────────────────────────────────────────────────────────────

router.get('/admin/all', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY sort_order ASC, id ASC').all());
});

router.post('/admin/upload', auth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'domingo-cars' },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      Readable.from(req.file.buffer).pipe(stream);
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', auth, (req, res) => {
  const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM cars').get().next;
  const result = db.prepare(`
    INSERT INTO cars (name, category, price_per_day, image_url, description, matricule, status, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, price_per_day, image_url || '', description || '', matricule || '', status || 'active', maxOrder);

  res.status(201).json(db.prepare('SELECT * FROM cars WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/admin/:id', auth, (req, res) => {
  const { id } = req.params;
  const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
  db.prepare(`
    UPDATE cars SET name=?, category=?, price_per_day=?, image_url=?, description=?, matricule=?, status=?
    WHERE id=?
  `).run(name, category, price_per_day, image_url || '', description || '', matricule || '', status, id);

  res.json(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
});

router.delete('/admin/:id', auth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM cars WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
