const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET next contract number (must be before /contracts/:id)
router.get('/contracts/next-number', async (req, res) => {
  try {
    const result = await pool.query('SELECT contract_number FROM contracts ORDER BY id DESC LIMIT 1');
    let next = 1;
    if (result.rows[0] && result.rows[0].contract_number) {
      const m = result.rows[0].contract_number.match(/DCR-(\d+)/);
      if (m) next = parseInt(m[1]) + 1;
    }
    res.json({ number: `DCR-${String(next).padStart(4, '0')}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all contracts
router.get('/contracts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, ca.name as car_name
      FROM contracts c
      LEFT JOIN cars ca ON c.car_id = ca.id
      ORDER BY c.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single contract
router.get('/contracts/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, ca.name as car_name, ca.price_per_day as car_price
      FROM contracts c
      LEFT JOIN cars ca ON c.car_id = ca.id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Contract not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create contract (auto-generate contract_number)
router.post('/contracts', async (req, res) => {
  try {
    const data = req.body;

    let contractNumber = data.contract_number;
    if (!contractNumber) {
      const last = await pool.query('SELECT contract_number FROM contracts ORDER BY id DESC LIMIT 1');
      let next = 1;
      if (last.rows[0] && last.rows[0].contract_number) {
        const m = last.rows[0].contract_number.match(/DCR-(\d+)/);
        if (m) next = parseInt(m[1]) + 1;
      }
      contractNumber = `DCR-${String(next).padStart(4, '0')}`;
    }

    const result = await pool.query(`
      INSERT INTO contracts (
        contract_number, contract_date, car_id, matricule, category, brand, model,
        client_name, client_dob, client_phone, client_cin, client_cin_expiry, client_address,
        client_permis, client_permis_expiry,
        driver2_name, driver2_dob, driver2_phone, driver2_cin, driver2_cin_expiry,
        driver2_address, driver2_permis, driver2_permis_expiry,
        nb_days, price_per_day, total, avance, reste,
        depart_datetime, depart_km, depart_inspection, depart_fuel,
        retour_prevu, retour_effectif, retour_km, retour_fuel
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31,$32,$33,$34,$35,$36
      ) RETURNING id
    `, [
      contractNumber, data.contract_date, data.car_id || null, data.matricule, data.category,
      data.brand, data.model, data.client_name, data.client_dob, data.client_phone,
      data.client_cin, data.client_cin_expiry, data.client_address,
      data.client_permis, data.client_permis_expiry,
      data.driver2_name || null, data.driver2_dob || null, data.driver2_phone || null,
      data.driver2_cin || null, data.driver2_cin_expiry || null,
      data.driver2_address || null, data.driver2_permis || null, data.driver2_permis_expiry || null,
      data.nb_days, data.price_per_day, data.total, data.avance, data.reste,
      data.depart_datetime, data.depart_km, data.depart_inspection || 'Aucun point signalé',
      data.depart_fuel || '1/8', data.retour_prevu, data.retour_effectif || null,
      data.retour_km || null, data.retour_fuel || null,
    ]);

    const contract = await pool.query(`
      SELECT c.*, ca.name as car_name FROM contracts c
      LEFT JOIN cars ca ON c.car_id = ca.id
      WHERE c.id = $1
    `, [result.rows[0].id]);
    res.status(201).json(contract.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update contract
router.put('/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    await pool.query(`
      UPDATE contracts SET
        contract_number=$1, contract_date=$2, car_id=$3, matricule=$4, category=$5, brand=$6, model=$7,
        client_name=$8, client_dob=$9, client_phone=$10, client_cin=$11, client_cin_expiry=$12,
        client_address=$13, client_permis=$14, client_permis_expiry=$15,
        driver2_name=$16, driver2_dob=$17, driver2_phone=$18, driver2_cin=$19, driver2_cin_expiry=$20,
        driver2_address=$21, driver2_permis=$22, driver2_permis_expiry=$23,
        nb_days=$24, price_per_day=$25, total=$26, avance=$27, reste=$28,
        depart_datetime=$29, depart_km=$30, depart_inspection=$31, depart_fuel=$32,
        retour_prevu=$33, retour_effectif=$34, retour_km=$35, retour_fuel=$36
      WHERE id=$37
    `, [
      data.contract_number, data.contract_date, data.car_id || null, data.matricule, data.category,
      data.brand, data.model, data.client_name, data.client_dob, data.client_phone,
      data.client_cin, data.client_cin_expiry, data.client_address,
      data.client_permis, data.client_permis_expiry,
      data.driver2_name || null, data.driver2_dob || null, data.driver2_phone || null,
      data.driver2_cin || null, data.driver2_cin_expiry || null,
      data.driver2_address || null, data.driver2_permis || null, data.driver2_permis_expiry || null,
      data.nb_days, data.price_per_day, data.total, data.avance, data.reste,
      data.depart_datetime, data.depart_km, data.depart_inspection,
      data.depart_fuel, data.retour_prevu, data.retour_effectif || null,
      data.retour_km || null, data.retour_fuel || null,
      id,
    ]);

    const contract = await pool.query(`
      SELECT c.*, ca.name as car_name FROM contracts c
      LEFT JOIN cars ca ON c.car_id = ca.id
      WHERE c.id = $1
    `, [id]);
    res.json(contract.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE contract
router.delete('/contracts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contracts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
