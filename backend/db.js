// backend/db.js — Inicialización de base de datos Turso (LibSQL)
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Función para inicializar las tablas de forma asíncrona al arrancar
async function initDB() {
  try {
    // Turso/LibSQL no soporta múltiples sentencias en un solo .execute() si llevan CREATE TABLE consecutivas,
    // por lo que ejecutamos un bloque batch.
    await db.batch([
      `CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT,
        price       TEXT,
        category    TEXT,
        hashtags    TEXT,
        images      TEXT    NOT NULL DEFAULT '[]',
        published_at TEXT   NOT NULL DEFAULT (datetime('now')),
        scheduled_at TEXT,
        status      TEXT    NOT NULL DEFAULT 'published',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS social_posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        network     TEXT    NOT NULL,
        post_id     TEXT,
        status      TEXT    NOT NULL DEFAULT 'pending',
        error_msg   TEXT,
        posted_at   TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);`,
      `CREATE INDEX IF NOT EXISTS idx_social_posts_product ON social_posts(product_id);`
    ], "write");

    // Valores por defecto de configuración
    const defaults = {
      restaurant_name: process.env.RESTAURANT_NAME || 'Mi Restaurante',
      active_networks: JSON.stringify(['instagram', 'facebook', 'twitter', 'tiktok']),
    };

    for (const [k, v] of Object.entries(defaults)) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);`,
        args: [k, v]
      });
    }
    console.log('[Turso DB] Tablas e índices verificados con éxito.');
  } catch (error) {
    console.error('[Turso DB Error] Error al inicializar la base de datos:', error.message);
  }
}

// Ejecutamos la inicialización
initDB();

module.exports = db;
