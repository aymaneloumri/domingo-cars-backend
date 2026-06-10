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

// GET /api/dashboard/gestion-stats
router.get('/gestion-stats', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    const password = process.env.ADMIN_PASSWORD || 'domingo2024';
    if (token !== password) return res.status(401).json({ error: 'Non autorisé' });

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';
    const monthEnd = today.slice(0, 7) + '-31';
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      resaMois, resaAujourdhui, resaSemaine,
      revenuMois, revenuParVoiture,
      revenu6Mois,
      clientsTotal, clientsMois, clientsFrequents,
      cautionsAttente, cautionsMontant,
      tauxOccupation, sansFin, voituresIndispo,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM reservations WHERE start_date >= $1 AND start_date <= $2`,
        [monthStart, monthEnd]
      ),
      pool.query(
        `SELECT COUNT(*) FROM reservations
         WHERE status IN ('confirmed','pending')
         AND start_date <= $1 AND (end_date >= $1 OR end_date IS NULL)`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) FROM reservations
         WHERE status IN ('confirmed','pending')
         AND start_date > $1 AND start_date <= $2`,
        [today, weekEnd]
      ),
      pool.query(
        `SELECT COALESCE(SUM(prix_total), 0) as total FROM reservations
         WHERE status = 'confirmed' AND start_date >= $1 AND start_date <= $2`,
        [monthStart, monthEnd]
      ),
      pool.query(
        `SELECT c.name as car_name,
                COALESCE(SUM(r.prix_total), 0) as total,
                COUNT(r.id) as count
         FROM cars c
         LEFT JOIN reservations r ON r.car_id = c.id
           AND r.status = 'confirmed'
           AND r.start_date >= $1 AND r.start_date <= $2
         GROUP BY c.id, c.name ORDER BY total DESC`,
        [monthStart, monthEnd]
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', start_date::date), 'YYYY-MM') as mois,
                COALESCE(SUM(prix_total), 0) as total
         FROM reservations
         WHERE status = 'confirmed'
           AND start_date >= (CURRENT_DATE - INTERVAL '6 months')::text
         GROUP BY DATE_TRUNC('month', start_date::date)
         ORDER BY mois ASC`
      ),
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query(`SELECT COUNT(*) FROM clients WHERE created_at >= $1`, [monthStart]),
      pool.query(
        `SELECT cl.nom_prenom, COUNT(r.id) as nb_reservations,
                COALESCE(SUM(r.prix_total), 0) as total_depense
         FROM clients cl
         LEFT JOIN reservations r ON r.client_id = cl.id
         GROUP BY cl.id, cl.nom_prenom
         HAVING COUNT(r.id) > 0
         ORDER BY nb_reservations DESC LIMIT 5`
      ),
      pool.query(
        `SELECT COUNT(*) FROM reservations
         WHERE caution_type != 'aucune' AND caution_type IS NOT NULL
         AND caution_rendue = false AND status IN ('confirmed','pending')`
      ),
      pool.query(
        `SELECT COALESCE(SUM(caution_montant), 0) as total FROM reservations
         WHERE caution_type != 'aucune' AND caution_type IS NOT NULL
         AND caution_rendue = false`
      ),
      pool.query(
        `SELECT c.name as car_name,
                COUNT(r.id) as nb_locations,
                COALESCE(SUM(r.nb_jours), 0) as jours_loues
         FROM cars c
         LEFT JOIN reservations r ON r.car_id = c.id
           AND r.status = 'confirmed' AND r.start_date >= $1
         GROUP BY c.id, c.name ORDER BY jours_loues DESC`,
        [monthStart]
      ),
      pool.query(
        `SELECT COUNT(*) FROM reservations
         WHERE (end_date IS NULL OR end_date = '')
         AND status IN ('confirmed','pending')`
      ),
      pool.query(
        `SELECT COUNT(DISTINCT car_id) FROM reservations
         WHERE status IN ('confirmed','pending')
         AND start_date <= $1 AND (end_date >= $1 OR end_date IS NULL)`,
        [today]
      ),
    ]);

    const totalCarsRes = await pool.query('SELECT COUNT(*) FROM cars');

    res.json({
      reservations: {
        ce_mois:        parseInt(resaMois.rows[0].count),
        aujourd_hui:    parseInt(resaAujourdhui.rows[0].count),
        cette_semaine:  parseInt(resaSemaine.rows[0].count),
        sans_fin:       parseInt(sansFin.rows[0].count),
      },
      revenus: {
        ce_mois:         parseFloat(revenuMois.rows[0].total),
        par_voiture:     revenuParVoiture.rows,
        meilleure_voiture: revenuParVoiture.rows[0] || null,
        six_mois:        revenu6Mois.rows,
      },
      clients: {
        total:              parseInt(clientsTotal.rows[0].count),
        nouveaux_ce_mois:   parseInt(clientsMois.rows[0].count),
        frequents:          clientsFrequents.rows,
      },
      cautions: {
        en_attente:    parseInt(cautionsAttente.rows[0].count),
        montant_total: parseFloat(cautionsMontant.rows[0].total),
      },
      flotte: {
        taux_occupation:              tauxOccupation.rows,
        indisponibles_aujourd_hui:    parseInt(voituresIndispo.rows[0].count),
        total:                        parseInt(totalCarsRes.rows[0].count),
      },
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
