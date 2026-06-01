require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'domingo_cars.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_per_day REAL NOT NULL,
    image_url TEXT,
    description TEXT,
    matricule TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (car_id) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT UNIQUE,
    contract_date TEXT,
    car_id INTEGER,
    matricule TEXT,
    category TEXT,
    brand TEXT,
    model TEXT,
    client_name TEXT,
    client_dob TEXT,
    client_phone TEXT,
    client_cin TEXT,
    client_cin_expiry TEXT,
    client_address TEXT,
    client_permis TEXT,
    client_permis_expiry TEXT,
    driver2_name TEXT,
    driver2_dob TEXT,
    driver2_phone TEXT,
    driver2_cin TEXT,
    driver2_cin_expiry TEXT,
    driver2_address TEXT,
    driver2_permis TEXT,
    driver2_permis_expiry TEXT,
    nb_days INTEGER,
    price_per_day REAL,
    total REAL,
    avance REAL,
    reste REAL,
    depart_datetime TEXT,
    depart_km INTEGER,
    depart_inspection TEXT DEFAULT 'Aucun point signalé',
    depart_fuel TEXT DEFAULT '1/8',
    retour_prevu TEXT,
    retour_effectif TEXT,
    retour_km INTEGER,
    retour_fuel TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (car_id) REFERENCES cars(id)
  );
`);

// Add sort_order column if it doesn't exist
try { db.exec('ALTER TABLE cars ADD COLUMN sort_order INTEGER DEFAULT 0'); } catch (e) {}

// Seed cars
const carsCount = db.prepare('SELECT COUNT(*) as count FROM cars').get();
if (carsCount.count === 0) {
  const insertCar = db.prepare(`
    INSERT INTO cars (name, category, price_per_day, image_url, description, matricule, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seedCars = [
    ['Dacia Logan #1',   'Berline',  200, 'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800&auto=format&fit=crop', 'Berline confortable et économique', 'A-123-B-01', 'active'],
    ['Dacia Logan #2',   'Berline',  200, 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop', 'Berline confortable et économique', 'A-456-B-02', 'active'],
    ['Dacia Logan #3',   'Berline',  200, 'https://images.unsplash.com/photo-1493238792000-8113da705763?w=800&auto=format&fit=crop', 'Berline confortable et économique', 'A-789-C-03', 'active'],
    ['Dacia Logan #4',   'Berline',  200, 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&auto=format&fit=crop', 'Berline confortable et économique', 'B-012-D-04', 'active'],
    ['Dacia Sandero #1', 'Citadine', 180, 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&auto=format&fit=crop', 'Citadine agile et polyvalente',     'C-345-E-05', 'active'],
    ['Dacia Sandero #2', 'Citadine', 180, 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&auto=format&fit=crop', 'Citadine agile et polyvalente',     'C-678-F-06', 'active'],
    ['Renault Clio',     'Citadine', 220, 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop', 'Citadine élégante et dynamique',    'D-901-G-07', 'active'],
    ['Opel Corsa #1',    'Citadine', 210, 'https://images.unsplash.com/photo-1546614042-7df3c24c9e5d?w=800&auto=format&fit=crop', 'Citadine compacte et sportive',     'E-234-H-08', 'active'],
    ['Opel Corsa #2',    'Citadine', 210, 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&auto=format&fit=crop', 'Citadine compacte et sportive',     'E-567-I-09', 'active'],
  ];

  const insertAll = db.transaction((cars) => {
    for (const car of cars) insertCar.run(...car);
  });
  insertAll(seedCars);
}


// Seed announcements
const annCount = db.prepare('SELECT COUNT(*) as count FROM announcements').get();
if (annCount.count === 0) {
  db.prepare(`
    INSERT INTO announcements (title, message, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Bienvenue chez Domingo Cars Luxury Rent',
    'Profitez de nos tarifs spéciaux pour toute location de 7 jours et plus !',
    '2025-01-01',
    '2026-12-31',
    'active'
  );
}

module.exports = db;
