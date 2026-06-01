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

// POST create reservation (with conflict check)
router.post('/', (req, res) => {
  const { car_id, client_name, client_phone, start_date, end_date, status } = req.body;

  const conflict = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE car_id = ?
    AND status != 'cancelled'
    AND NOT (end_date < ? OR start_date > ?)
  `).get(car_id, start_date, end_date);

  if (conflict.count > 0) {
    return res.status(409).json({
      error: 'Conflit de dates avec une réservation existante',
      conflict: true
    });
  }

  const result = db.prepare(`
    INSERT INTO reservations (car_id, client_name, client_phone, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(car_id, client_name, client_phone, start_date, end_date, status || 'pending');

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
  const { car_id, client_name, client_phone, start_date, end_date, status } = req.body;

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
        conflict: true
      });
    }
  }

  db.prepare(`
    UPDATE reservations
    SET car_id=?, client_name=?, client_phone=?, start_date=?, end_date=?, status=?
    WHERE id=?
  `).run(car_id, client_name, client_phone, start_date, end_date, status, id);

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
