require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(helmet());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token'],
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
});

app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

const authMiddleware = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token.length < 8 || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// ── J-1 email alert ──────────────────────────────────────────────────────────
async function checkEndingReservations() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const pool = require('./db');
    const result = await pool.query(`
      SELECT r.*, c.name as car_name, c.matricule
      FROM reservations r
      LEFT JOIN cars c ON r.car_id = c.id
      WHERE r.end_date = $1
      AND r.status IN ('confirmed', 'pending')
    `, [tomorrowStr]);

    if (result.rows.length > 0) {
      for (const reservation of result.rows) {
        await resend.emails.send({
          from: 'Domingo Cars <notifications@domingocars.ma>',
          to: process.env.ADMIN_EMAIL || 'Domingocarsrent@gmail.com',
          subject: `⚠️ Retour véhicule demain — ${reservation.car_name} (${reservation.client_name})`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #FF6B00; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">DOMINGO CARS LUXURY RENT</h1>
              </div>
              <div style="padding: 30px; background: #f9f9f9;">
                <h2 style="color: #FF6B00;">⚠️ Retour véhicule prévu demain</h2>
                <p>Le véhicule suivant arrive en fin de contrat demain <strong>${tomorrowStr}</strong> :</p>
                <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
                  <tr style="background: #FF6B00; color: white;">
                    <td style="padding: 10px;">Véhicule</td>
                    <td style="padding: 10px;">Client</td>
                    <td style="padding: 10px;">Téléphone</td>
                    <td style="padding: 10px;">Date fin</td>
                  </tr>
                  <tr style="background: white;">
                    <td style="padding: 10px; border: 1px solid #ddd;">
                      ${reservation.car_name} ${reservation.matricule ? '(' + reservation.matricule + ')' : ''}
                    </td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${reservation.client_name}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${reservation.client_phone || '—'}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${reservation.end_date}</td>
                  </tr>
                </table>
                <p style="color: #666;">
                  Pensez à préparer la réception du véhicule, vérifier son état
                  et planifier une éventuelle nouvelle réservation.
                </p>
                <a href="https://www.domingocars.ma/chef/dashboard"
                   style="background: #FF6B00; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                  Voir le calendrier →
                </a>
              </div>
              <div style="background: #0a0a0a; padding: 15px; text-align: center;">
                <p style="color: #666; font-size: 12px; margin: 0;">
                  Domingo Cars Luxury Rent — Casablanca, Maroc
                </p>
              </div>
            </div>
          `
        });
        console.log(`Email sent for reservation ${reservation.id} - ${reservation.car_name}`);
      }
    } else {
      console.log('No reservations ending tomorrow');
    }
  } catch (err) {
    console.error('Email check error:', err.message);
  }
}

// DB debug route
app.get('/test-db', async (req, res) => {
  try {
    const pool = require('./db');
    if (!pool) return res.json({ error: 'Pool is null - check db.js logs' });
    const result = await pool.query('SELECT NOW() as time');
    res.json({ success: true, time: result.rows[0].time, message: 'DB connected!' });
  } catch (err) {
    res.json({ error: err.message, code: err.code, detail: err.detail || 'no detail' });
  }
});

// Email test route
app.get('/test-email', async (req, res) => {
  await checkEndingReservations();
  res.json({ success: true, message: 'Email check triggered' });
});

// Auth endpoint
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ token: process.env.ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

// Alerts route
app.use('/api/alerts', require('./routes/alerts'));

// Resource routes
app.use('/api/cars', require('./routes/cars'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/reservations', authMiddleware, require('./routes/reservations'));
app.use('/api/clients', require('./routes/clients'));

// Dashboard route
app.use('/api/dashboard', authMiddleware, require('./routes/dashboard'));
// Contracts routes — mounted at both /api/admin (legacy) and /api (used by frontend)
app.use('/api/admin', authMiddleware, require('./routes/contracts'));
app.use('/api', authMiddleware, require('./routes/contracts'));

// ── Alerts deadline cron ──────────────────────────────────────────────────────
async function checkAlerts() {
  try {
    const pool = require('./db');
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const result = await pool.query(
      `SELECT * FROM alerts WHERE status = 'active' AND end_date >= $1`,
      [todayStr]
    );

    const alertDays = [30, 15, 10, 5, 2, 1];

    for (const alert of result.rows) {
      const endDate = new Date(alert.end_date);
      const diffTime = endDate - today;
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (alertDays.includes(daysLeft)) {
        const urgency = daysLeft <= 2 ? '🚨' : daysLeft <= 5 ? '⚠️' : '🔔';
        const subject = `${urgency} Alerte échéance J-${daysLeft} — ${alert.title}`;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0a0a0a; padding: 20px; text-align: center;">
              <h1 style="color: #FF6B00; margin: 0; font-size: 22px; letter-spacing: 2px;">DOMINGO CARS LUXURY RENT</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: ${daysLeft <= 2 ? '#e24b4a' : daysLeft <= 5 ? '#FF6B00' : '#333'};">
                ${urgency} Rappel échéance — J-${daysLeft}
              </h2>
              <table style="width:100%; border-collapse:collapse;">
                <tr style="background: #FF6B00;">
                  <td colspan="2" style="padding:10px 16px; color:#fff; font-weight:bold;">DÉTAILS DE L'ALERTE</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px; border:1px solid #ddd; color:#666; width:40%;">Tâche</td>
                  <td style="padding:10px 16px; border:1px solid #ddd; font-weight:bold;">${alert.title}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding:10px 16px; border:1px solid #ddd; color:#666;">Type</td>
                  <td style="padding:10px 16px; border:1px solid #ddd;">${alert.type}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px; border:1px solid #ddd; color:#666;">Date d'échéance</td>
                  <td style="padding:10px 16px; border:1px solid #ddd; color:#e24b4a; font-weight:bold;">
                    ${new Date(alert.end_date).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding:10px 16px; border:1px solid #ddd; color:#666;">Jours restants</td>
                  <td style="padding:10px 16px; border:1px solid #ddd; color:${daysLeft <= 2 ? '#e24b4a' : '#FF6B00'}; font-size:20px; font-weight:bold;">
                    ${daysLeft} jour(s)
                  </td>
                </tr>
                ${alert.notes ? `<tr><td style="padding:10px 16px; border:1px solid #ddd; color:#666;">Notes</td><td style="padding:10px 16px; border:1px solid #ddd;">${alert.notes}</td></tr>` : ''}
              </table>
              <div style="margin-top:20px; text-align:center;">
                <a href="https://www.domingocars.ma/chef/alertes"
                   style="background:#FF6B00; color:#fff; padding:12px 24px; text-decoration:none; border-radius:4px; display:inline-block;">
                  Gérer les alertes →
                </a>
              </div>
            </div>
            <div style="background:#0a0a0a; padding:14px; text-align:center;">
              <p style="color:#555; font-size:11px; margin:0;">Domingo Cars Luxury Rent — Casablanca, Maroc</p>
            </div>
          </div>
        `;

        await resend.emails.send({
          from: 'Domingo Cars <notifications@domingocars.ma>',
          to: process.env.ADMIN_EMAIL || 'Domingocarsrent@gmail.com',
          subject,
          html,
        });

        console.log(`Alert email sent: ${alert.title} — J-${daysLeft}`);
      }
    }
  } catch (err) {
    console.error('checkAlerts error:', err.message);
  }
}

app.get('/test-alerts', async (req, res) => {
  await checkAlerts();
  res.json({ success: true, message: 'Alerts check triggered' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  // Run once at startup then every 24 hours
  checkEndingReservations();
  setInterval(checkEndingReservations, 24 * 60 * 60 * 1000);
  checkAlerts();
  setInterval(checkAlerts, 24 * 60 * 60 * 1000);
});
