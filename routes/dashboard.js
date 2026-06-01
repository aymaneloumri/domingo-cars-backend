const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/dashboard?stats=1
// GET /api/dashboard?calendar=1&month=YYYY-MM
router.get('/', async (req, res) => {
  try {
    if (req.query.stats) {
      const today = new Date().toISOString().split('T')[0];
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const totalCarsRes = await pool.query('SELECT COUNT(*) as count FROM cars');
      const totalCars = parseInt(totalCarsRes.rows[0].count);

      const rentedRes = await pool.query(
        `SELECT COUNT(DISTINCT car_id) as count FROM reservations
         WHERE status = 'confirmed' AND start_date <= $1 AND end_date >= $1`,
        [today]
      );
      const rentedToday = parseInt(rentedRes.rows[0].count);
      const availableToday = totalCars - rentedToday;

      const monthlyRes = await pool.query(
        `SELECT COUNT(*) as count FROM reservations
         WHERE status != 'cancelled' AND start_date <= $1 AND end_date >= $2`,
        [monthEnd, monthStart]
      );
      const monthlyCount = parseInt(monthlyRes.rows[0].count);

      return res.json({ totalCars, availableToday, rentedToday, monthlyCount });
    }

    if (req.query.calendar) {
      const { month } = req.query;
      if (!month) return res.status(400).json({ error: 'month required' });

      const [year, mon] = month.split('-');
      const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

      const carsRes = await pool.query('SELECT * FROM cars ORDER BY sort_order ASC, id ASC');
      const resRes = await pool.query(
        `SELECT r.*, c.name as car_name
         FROM reservations r
         LEFT JOIN cars c ON r.car_id = c.id
         WHERE NOT (r.end_date < $1 OR r.start_date > $2)
         ORDER BY r.start_date`,
        [monthStart, monthEnd]
      );

      return res.json({ cars: carsRes.rows, reservations: resRes.rows });
    }

    res.status(400).json({ error: 'Missing query param: use ?stats=1 or ?calendar=1&month=YYYY-MM' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
