const express = require('express')
const router = express.Router()
const multer = require('multer')
const { Readable } = require('stream')
const cloudinary = require('cloudinary').v2
const pool = require('../db')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Format non supporté'))
  },
})

const auth = (req) =>
  req.headers['x-admin-token'] === (process.env.ADMIN_PASSWORD || 'domingo2024')

pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Settings table init error:', err.message))

router.get('/:key', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM settings WHERE key=$1', [req.params.key]
    )
    res.json(result.rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:key', async (req, res) => {
  try {
    if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
    const { value } = req.body
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [req.params.key, value]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/upload-signature', upload.single('image'), async (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' })
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' })
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'domingo-cars/signatures' },
        (err, result) => (err ? reject(err) : resolve(result))
      )
      Readable.from(req.file.buffer).pipe(stream)
    })
    const url = result.secure_url
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('signature_url', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [url]
    )
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
