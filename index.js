require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token'],
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const authMiddleware = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// Auth endpoint
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ token: process.env.ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

// Resource routes
app.use('/api/cars', require('./routes/cars'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/reservations', authMiddleware, require('./routes/reservations'));

// Dashboard route
app.use('/api/dashboard', authMiddleware, require('./routes/dashboard'));
// Contracts route
app.use('/api/admin', authMiddleware, require('./routes/contracts'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
