const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all reservations (with car info)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, c.name as car_name
      FROM reservations r
      LEFT JOIN cars c ON r.car_id = c.id
      ORDER BY r.start_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /monthly-report?month=YYYY-MM — must be before /:id wildcard
router.get('/monthly-report', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'month required' });

    const [year, mon] = month.split('-');
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    const result = await pool.query(
      `SELECT r.*, c.name as car_name
       FROM reservations r
       LEFT JOIN cars c ON r.car_id = c.id
       WHERE r.status != 'cancelled'
       AND NOT (r.end_date < $1 OR r.start_date > $2)
       ORDER BY c.name, r.start_date`,
      [monthStart, monthEnd]
    );

    const byCarMap = {};
    for (const r of result.rows) {
      if (!byCarMap[r.car_id]) {
        byCarMap[r.car_id] = {
          car_name: r.car_name || `Voiture #${r.car_id}`,
          reservations_count: 0,
          total_jours: 0,
          total_revenue: 0,
          reservations: [],
        };
      }
      byCarMap[r.car_id].reservations_count++;
      byCarMap[r.car_id].total_jours += (r.nb_jours || 0);
      byCarMap[r.car_id].total_revenue += parseFloat(r.prix_total || 0);
      byCarMap[r.car_id].reservations.push(r);
    }

    const cars = Object.values(byCarMap);
    const total_revenue = cars.reduce((sum, c) => sum + c.total_revenue, 0);
    const total_reservations = cars.reduce((sum, c) => sum + c.reservations_count, 0);
    const total_jours = cars.reduce((sum, c) => sum + c.total_jours, 0);

    res.json({ month, cars, total_revenue, total_reservations, total_jours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create reservation (with conflict check)
router.post('/', async (req, res) => {
  try {
    const { car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total } = req.body;

    const conflict = await pool.query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE car_id = $1 AND status != 'cancelled'
       AND NOT (end_date < $2 OR start_date > $3)`,
      [car_id, start_date, end_date]
    );

    if (parseInt(conflict.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Conflit de dates avec une réservation existante', conflict: true });
    }

    const result = await pool.query(
      `INSERT INTO reservations (car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [car_id, client_name, client_phone, start_date, end_date, status || 'pending',
       prix_par_jour || 0, nb_jours || 0, prix_total || 0]
    );

    const reservation = await pool.query(
      `SELECT r.*, c.name as car_name FROM reservations r
       LEFT JOIN cars c ON r.car_id = c.id
       WHERE r.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(reservation.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update reservation (with conflict check, excluding self)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total } = req.body;

    if (status !== 'cancelled') {
      const conflict = await pool.query(
        `SELECT COUNT(*) as count FROM reservations
         WHERE car_id = $1 AND status != 'cancelled'
         AND NOT (end_date < $2 OR start_date > $3)
         AND id != $4`,
        [car_id, start_date, end_date, id]
      );

      if (parseInt(conflict.rows[0].count) > 0) {
        return res.status(409).json({ error: 'Conflit de dates avec une réservation existante', conflict: true });
      }
    }

    await pool.query(
      `UPDATE reservations
       SET car_id=$1, client_name=$2, client_phone=$3, start_date=$4, end_date=$5, status=$6,
           prix_par_jour=$7, nb_jours=$8, prix_total=$9
       WHERE id=$10`,
      [car_id, client_name, client_phone, start_date, end_date, status,
       prix_par_jour || 0, nb_jours || 0, prix_total || 0, id]
    );

    const reservation = await pool.query(
      `SELECT r.*, c.name as car_name FROM reservations r
       LEFT JOIN cars c ON r.car_id = c.id
       WHERE r.id = $1`,
      [id]
    );
    res.json(reservation.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE reservation
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reservations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
