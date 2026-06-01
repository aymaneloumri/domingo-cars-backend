const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard?stats=1
// GET /api/dashboard?calendar=1&month=YYYY-MM
router.get('/', (req, res) => {
  if (req.query.stats) {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const totalCars = db.prepare("SELECT COUNT(*) as count FROM cars").get().count;

    const rentedToday = db.prepare(`
      SELECT COUNT(DISTINCT car_id) as count FROM reservations
      WHERE status = 'confirmed'
      AND start_date <= ? AND end_date >= ?
    `).get(today, today).count;

    const availableToday = totalCars - rentedToday;

    const monthlyCount = db.prepare(`
      SELECT COUNT(*) as count FROM reservations
      WHERE status != 'cancelled'
      AND start_date <= ? AND end_date >= ?
    `).get(monthEnd, monthStart).count;

    return res.json({ totalCars, availableToday, rentedToday, monthlyCount });
  }

  if (req.query.calendar) {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'month required' });

    const [year, mon] = month.split('-');
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    const cars = db.prepare('SELECT * FROM cars ORDER BY sort_order ASC, id ASC').all();
    const reservations = db.prepare(`
      SELECT r.*, c.name as car_name
      FROM reservations r
      LEFT JOIN cars c ON r.car_id = c.id
      WHERE NOT (r.end_date < ? OR r.start_date > ?)
      ORDER BY r.start_date
    `).all(monthStart, monthEnd);

    return res.json({ cars, reservations });
  }

  res.status(400).json({ error: 'Missing query param: use ?stats=1 or ?calendar=1&month=YYYY-MM' });
});

module.exports = router;
