const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

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

// POST send contract by email
router.post('/contracts/send-email', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    const password = process.env.ADMIN_PASSWORD || 'domingo2024';
    if (token !== password) return res.status(401).json({ error: 'Non autorisé' });

    const { emails, contract } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Aucun email fourni' });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto;">
        <div style="background: #0a0a0a; padding: 24px; text-align: center;">
          <h1 style="color: #FF6B00; margin: 0; font-size: 24px; letter-spacing: 3px;">DOMINGO CARS LUXURY RENT</h1>
          <p style="color: #888; margin: 6px 0 0; font-size: 13px;">Contrat de location de voiture</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 4px;">Bonjour ${contract.client_name || ''},</h2>
          <p style="color: #666; margin-bottom: 24px;">
            Veuillez trouver ci-dessous les détails de votre contrat de location
            <strong style="color: #FF6B00;">${contract.contract_number || ''}</strong>.
          </p>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr style="background: #FF6B00;">
              <td colspan="2" style="padding: 12px 16px; color: #fff; font-weight: bold; font-size: 14px; letter-spacing: 1px;">📋 DÉTAILS DU CONTRAT</td>
            </tr>
            ${[
              ['N° Contrat', contract.contract_number || '—', '#fff'],
              ['Date du contrat', contract.contract_date || '—', '#f9f9f9'],
              ['Véhicule', `${contract.brand || ''} ${contract.model || ''} ${contract.matricule ? '('+contract.matricule+')' : ''}`, '#fff'],
              ['Départ', contract.depart_datetime || contract.start_date || '—', '#f9f9f9'],
              ['Retour prévu', contract.retour_prevu || contract.end_date || '—', '#fff'],
              ['Durée', `${contract.nb_days || '—'} jours`, '#f9f9f9'],
              ['Prix / jour', `${contract.price_per_day || '—'} MAD`, '#fff'],
            ].map(([label, value, bg]) => `
              <tr style="background: ${bg};">
                <td style="padding: 10px 16px; border: 1px solid #eee; color: #666; font-size: 13px; width: 40%;">${label}</td>
                <td style="padding: 10px 16px; border: 1px solid #eee; color: #333; font-size: 13px;">${value}</td>
              </tr>`).join('')}
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #666; font-size: 13px;">Total</td>
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #FF6B00; font-weight: bold; font-size: 16px;">${contract.total || '—'} MAD</td>
            </tr>
            <tr style="background: #fff;">
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #666; font-size: 13px;">Avance versée</td>
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #333; font-size: 13px;">${contract.avance || 0} MAD</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #666; font-size: 13px;">Reste à payer</td>
              <td style="padding: 10px 16px; border: 1px solid #eee; color: #e24b4a; font-weight: bold; font-size: 14px;">${contract.reste || '—'} MAD</td>
            </tr>
          </table>
          <table style="width:100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr style="background: #0a0a0a;">
              <td colspan="2" style="padding: 12px 16px; color: #fff; font-weight: bold; font-size: 14px; letter-spacing: 1px;">👤 INFORMATIONS LOCATAIRE</td>
            </tr>
            ${[
              ['Nom & Prénom', contract.client_name || '—', '#fff'],
              ['Téléphone', contract.client_phone || '—', '#f9f9f9'],
              ['CIN / Passeport', contract.client_cin || '—', '#fff'],
              ['Permis', contract.client_permis || '—', '#f9f9f9'],
            ].map(([label, value, bg]) => `
              <tr style="background: ${bg};">
                <td style="padding: 10px 16px; border: 1px solid #eee; color: #666; font-size: 13px; width: 40%;">${label}</td>
                <td style="padding: 10px 16px; border: 1px solid #eee; color: #333; font-size: 13px;">${value}</td>
              </tr>`).join('')}
          </table>
          <div style="background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #666; font-size: 12px; margin: 0 0 8px;">Pour toute question, contactez-nous :</p>
            <p style="margin: 4px 0; font-size: 13px; color: #333;">📞 <strong>+212 701 050 809</strong></p>
            <p style="margin: 4px 0; font-size: 13px; color: #333;">📧 <strong>Domingocarsrent@gmail.com</strong></p>
            <p style="margin: 4px 0; font-size: 13px; color: #333;">📸 <strong>@Domingocarsrent</strong></p>
          </div>
          <p style="color: #999; font-size: 11px; text-align: center;">
            Ce document est généré automatiquement par le système Domingo Cars Luxury Rent.
          </p>
        </div>
        <div style="background: #0a0a0a; padding: 16px; text-align: center;">
          <p style="color: #555; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} Domingo Cars Luxury Rent — Casablanca, Maroc</p>
        </div>
      </div>
    `;

    const results = [];
    for (const email of emails) {
      if (!email || !email.includes('@')) continue;
      const result = await resend.emails.send({
        from: 'Domingo Cars <notifications@domingocars.ma>',
        to: email.trim(),
        subject: `Votre contrat de location ${contract.contract_number || ''} — Domingo Cars`,
        html,
      });
      results.push({ email, id: result.id });
    }

    res.json({ success: true, sent: results.length, results });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
