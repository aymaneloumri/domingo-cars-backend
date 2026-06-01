const express = require('express');
const router = express.Router();
const db = require('../db');

// GET next contract number (must be before /:id)
router.get('/contracts/next-number', (req, res) => {
  const last = db.prepare("SELECT contract_number FROM contracts ORDER BY id DESC LIMIT 1").get();
  let next = 1;
  if (last && last.contract_number) {
    const m = last.contract_number.match(/DCR-(\d+)/);
    if (m) next = parseInt(m[1]) + 1;
  }
  res.json({ number: `DCR-${String(next).padStart(4, '0')}` });
});

// GET all contracts
router.get('/contracts', (req, res) => {
  const contracts = db.prepare(`
    SELECT c.*, ca.name as car_name
    FROM contracts c
    LEFT JOIN cars ca ON c.car_id = ca.id
    ORDER BY c.id DESC
  `).all();
  res.json(contracts);
});

// GET single contract
router.get('/contracts/:id', (req, res) => {
  const contract = db.prepare(`
    SELECT c.*, ca.name as car_name, ca.price_per_day as car_price
    FROM contracts c
    LEFT JOIN cars ca ON c.car_id = ca.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  res.json(contract);
});

// POST create contract (auto-generate contract_number)
router.post('/contracts', (req, res) => {
  const data = req.body;

  let contractNumber = data.contract_number;
  if (!contractNumber) {
    const last = db.prepare("SELECT contract_number FROM contracts ORDER BY id DESC LIMIT 1").get();
    let next = 1;
    if (last && last.contract_number) {
      const m = last.contract_number.match(/DCR-(\d+)/);
      if (m) next = parseInt(m[1]) + 1;
    }
    contractNumber = `DCR-${String(next).padStart(4, '0')}`;
  }

  const result = db.prepare(`
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
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
  `).run(
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
    data.retour_km || null, data.retour_fuel || null
  );

  const contract = db.prepare(`
    SELECT c.*, ca.name as car_name FROM contracts c
    LEFT JOIN cars ca ON c.car_id = ca.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(contract);
});

// PUT update contract
router.put('/contracts/:id', (req, res) => {
  const { id } = req.params;
  const data = req.body;

  db.prepare(`
    UPDATE contracts SET
      contract_number=?, contract_date=?, car_id=?, matricule=?, category=?, brand=?, model=?,
      client_name=?, client_dob=?, client_phone=?, client_cin=?, client_cin_expiry=?,
      client_address=?, client_permis=?, client_permis_expiry=?,
      driver2_name=?, driver2_dob=?, driver2_phone=?, driver2_cin=?, driver2_cin_expiry=?,
      driver2_address=?, driver2_permis=?, driver2_permis_expiry=?,
      nb_days=?, price_per_day=?, total=?, avance=?, reste=?,
      depart_datetime=?, depart_km=?, depart_inspection=?, depart_fuel=?,
      retour_prevu=?, retour_effectif=?, retour_km=?, retour_fuel=?
    WHERE id=?
  `).run(
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
    id
  );

  const contract = db.prepare(`
    SELECT c.*, ca.name as car_name FROM contracts c
    LEFT JOIN cars ca ON c.car_id = ca.id
    WHERE c.id = ?
  `).get(id);
  res.json(contract);
});

// DELETE contract
router.delete('/contracts/:id', (req, res) => {
  db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
