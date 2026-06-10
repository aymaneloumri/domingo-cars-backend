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

// GET reservations by client — must be before /:id wildcard
router.get('/by-client/:client_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    const password = process.env.ADMIN_PASSWORD || 'domingo2024';
    if (token !== password) return res.status(401).json({ error: 'Non autorisé' });

    // Get client name for fallback name-based matching (old reservations have client_id = null)
    const clientRow = await pool.query('SELECT nom_prenom FROM clients WHERE id = $1', [req.params.client_id]);
    const clientName = clientRow.rows[0]?.nom_prenom || '';

    const result = await pool.query(`
      SELECT r.*, c.name as car_name, c.matricule, c.category,
             c.price_per_day, c.image_url,
             cl.nom_prenom as client_nom
      FROM reservations r
      LEFT JOIN cars c ON r.car_id = c.id
      LEFT JOIN clients cl ON r.client_id = cl.id
      WHERE r.client_id = $1
         OR ($2 != '' AND LOWER(r.client_name) LIKE LOWER($3))
      ORDER BY r.created_at DESC
    `, [req.params.client_id, clientName, `%${clientName}%`]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create reservation (with conflict check)
router.post('/', async (req, res) => {
  try {
    const { car_id, client_name, client_phone, client_id,
            start_date, end_date, start_datetime, end_datetime,
            status, prix_par_jour, nb_jours, prix_total } = req.body;

    const conflict = await pool.query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE car_id = $1 AND status != 'cancelled'
       AND NOT (end_date < $2 OR start_date > $3)`,
      [car_id, start_date, end_date]
    );

    if (parseInt(conflict.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Conflit de dates avec une réservation existante', conflict: true });
    }

    const {
      caution_type = 'aucune', caution_montant = 0, caution_avance = 0,
      caution_reste = 0, caution_rendue = false, caution_note = null,
      caution_cheque_numero = null, caution_document_description = null,
      caution_document_recu = false,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO reservations (car_id, client_name, client_phone, client_id,
         start_date, end_date, start_datetime, end_datetime,
         status, prix_par_jour, nb_jours, prix_total,
         caution_type, caution_montant, caution_avance, caution_reste,
         caution_rendue, caution_note, caution_cheque_numero,
         caution_document_description, caution_document_recu)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [car_id, client_name, client_phone, client_id || null,
       start_date, end_date, start_datetime || null, end_datetime || null,
       status || 'pending', prix_par_jour || 0, nb_jours || 0, prix_total || 0,
       caution_type, caution_montant || 0, caution_avance || 0, caution_reste || 0,
       caution_rendue || false, caution_note || null, caution_cheque_numero || null,
       caution_document_description || null, caution_document_recu || false]
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
    const { car_id, client_name, client_phone, client_id,
            start_date, end_date, start_datetime, end_datetime,
            status, prix_par_jour, nb_jours, prix_total,
            caution_type = 'aucune', caution_montant = 0, caution_avance = 0,
            caution_reste = 0, caution_rendue = false, caution_note = null,
            caution_cheque_numero = null, caution_document_description = null,
            caution_document_recu = false } = req.body;

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
       SET car_id=$1, client_name=$2, client_phone=$3, client_id=$4,
           start_date=$5, end_date=$6, start_datetime=$7, end_datetime=$8,
           status=$9, prix_par_jour=$10, nb_jours=$11, prix_total=$12,
           caution_type=$13, caution_montant=$14, caution_avance=$15,
           caution_reste=$16, caution_rendue=$17, caution_note=$18,
           caution_cheque_numero=$19, caution_document_description=$20,
           caution_document_recu=$21
       WHERE id=$22`,
      [car_id, client_name, client_phone, client_id || null,
       start_date, end_date, start_datetime || null, end_datetime || null,
       status, prix_par_jour || 0, nb_jours || 0, prix_total || 0,
       caution_type, caution_montant || 0, caution_avance || 0,
       caution_reste || 0, caution_rendue || false, caution_note || null,
       caution_cheque_numero || null, caution_document_description || null,
       caution_document_recu || false, id]
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

// PUT save invoice number to reservation
router.put('/:id/invoice', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    if (token !== (process.env.ADMIN_PASSWORD || 'domingo2024')) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const { invoice_number, invoice_date, avance, reste } = req.body;
    await pool.query(
      `UPDATE reservations SET invoice_number=$1, invoice_date=$2, avance=$3, reste=$4 WHERE id=$5`,
      [invoice_number, invoice_date, avance || 0, reste || 0, req.params.id]
    );
    res.json({ success: true });
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
