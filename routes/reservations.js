const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all reservations (with car info)
router.get('/', (req, res) => {
  const reservations = db.prepare(`
    SELECT r.*, c.name as car_name
    FROM reservations r
    LEFT JOIN cars c ON r.car_id = c.id
    ORDER BY r.start_date DESC
  `).all();
  res.json(reservations);
});

// GET /monthly-report?month=YYYY-MM — must be before /:id wildcard
router.get('/monthly-report', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month required' });

  const [year, mon] = month.split('-');
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  const reservations = db.prepare(`
    SELECT r.*, c.name as car_name
    FROM reservations r
    LEFT JOIN cars c ON r.car_id = c.id
    WHERE r.status != 'cancelled'
    AND NOT (r.end_date < ? OR r.start_date > ?)
    ORDER BY c.name, r.start_date
  `).all(monthStart, monthEnd);

  const byCarMap = {};
  for (const r of reservations) {
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
    byCarMap[r.car_id].total_revenue += (r.prix_total || 0);
    byCarMap[r.car_id].reservations.push(r);
  }

  const cars = Object.values(byCarMap);
  const total_revenue = cars.reduce((sum, c) => sum + c.total_revenue, 0);
  const total_reservations = cars.reduce((sum, c) => sum + c.reservations_count, 0);
  const total_jours = cars.reduce((sum, c) => sum + c.total_jours, 0);

  res.json({ month, cars, total_revenue, total_reservations, total_jours });
});

// POST create reservation (with conflict check)
router.post('/', (req, res) => {
  const { car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total } = req.body;

  const conflict = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE car_id = ?
    AND status != 'cancelled'
    AND NOT (end_date < ? OR start_date > ?)
  `).get(car_id, start_date, end_date);

  if (conflict.count > 0) {
    return res.status(409).json({
      error: 'Conflit de dates avec une réservation existante',
      conflict: true,
    });
  }

  const result = db.prepare(`
    INSERT INTO reservations (car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(car_id, client_name, client_phone, start_date, end_date, status || 'pending',
         prix_par_jour || 0, nb_jours || 0, prix_total || 0);

  const reservation = db.prepare(`
    SELECT r.*, c.name as car_name FROM reservations r
    LEFT JOIN cars c ON r.car_id = c.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(reservation);
});

// PUT update reservation (with conflict check, excluding self)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { car_id, client_name, client_phone, start_date, end_date, status, prix_par_jour, nb_jours, prix_total } = req.body;

  if (status !== 'cancelled') {
    const conflict = db.prepare(`
      SELECT COUNT(*) as count FROM reservations
      WHERE car_id = ?
      AND status != 'cancelled'
      AND NOT (end_date < ? OR start_date > ?)
      AND id != ?
    `).get(car_id, start_date, end_date, id);

    if (conflict.count > 0) {
      return res.status(409).json({
        error: 'Conflit de dates avec une réservation existante',
        conflict: true,
      });
    }
  }

  db.prepare(`
    UPDATE reservations
    SET car_id=?, client_name=?, client_phone=?, start_date=?, end_date=?, status=?,
        prix_par_jour=?, nb_jours=?, prix_total=?
    WHERE id=?
  `).run(car_id, client_name, client_phone, start_date, end_date, status,
         prix_par_jour || 0, nb_jours || 0, prix_total || 0, id);

  const reservation = db.prepare(`
    SELECT r.*, c.name as car_name FROM reservations r
    LEFT JOIN cars c ON r.car_id = c.id
    WHERE r.id = ?
  `).get(id);
  res.json(reservation);
});

// DELETE reservation
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
