const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const pool = require('../db');

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

// ── Admin routes (must be before /:id wildcard) ───────────────────────────────

router.get('/admin/all', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cars ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

router.post('/admin', auth, async (req, res) => {
  try {
    const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
    const orderRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM cars');
    const maxOrder = orderRes.rows[0].next;
    const result = await pool.query(
      `INSERT INTO cars (name, category, price_per_day, image_url, description, matricule, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, category, price_per_day, image_url || '', description || '', matricule || '', status || 'active', maxOrder]
    );
    const car = await pool.query('SELECT * FROM cars WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(car.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price_per_day, image_url, description, matricule, status } = req.body;
    await pool.query(
      `UPDATE cars SET name=$1, category=$2, price_per_day=$3, image_url=$4, description=$5, matricule=$6, status=$7
       WHERE id=$8`,
      [name, category, price_per_day, image_url || '', description || '', matricule || '', status, id]
    );
    const car = await pool.query('SELECT * FROM cars WHERE id = $1', [id]);
    res.json(car.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cars WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public routes (/:id wildcard must be last) ────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM cars WHERE status = 'active' ORDER BY sort_order ASC, id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE car_id = $1 AND status != 'cancelled'
       AND NOT (end_date < $2 OR start_date > $3)`,
      [id, start, end]
    );
    res.json({ available: parseInt(result.rows[0].count) === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
