// backend/db.js — Inicialización de base de datos SQLite
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'restaurante.db');

// Crea el directorio de datos si no existe
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Habilita WAL para mejor rendimiento
db.pragma('journal_mode = WAL');

// ── TABLAS ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    price       TEXT,
    category    TEXT,
    hashtags    TEXT,
    images      TEXT    NOT NULL DEFAULT '[]',  -- JSON array de rutas
    published_at TEXT   NOT NULL DEFAULT (datetime('now')),
    scheduled_at TEXT,
    status      TEXT    NOT NULL DEFAULT 'published', -- published | scheduled | draft
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS social_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    network     TEXT    NOT NULL,  -- instagram | facebook | twitter | tiktok
    post_id     TEXT,              -- ID devuelto por la red social
    status      TEXT    NOT NULL DEFAULT 'pending', -- pending | ok | error
    error_msg   TEXT,
    posted_at   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_social_posts_product ON social_posts(product_id);
`);

// Valores por defecto de configuración
const defaults = {
  restaurant_name: process.env.RESTAURANT_NAME || 'Mi Restaurante',
  active_networks: JSON.stringify(['instagram', 'facebook', 'twitter', 'tiktok']),
};
const insertSetting = db.prepare(
  `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
);
for (const [k, v] of Object.entries(defaults)) {
  insertSetting.run(k, v);
}

module.exports = db;
