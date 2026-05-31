// backend/db.js - Versión segura para Vercel
const { createClient } = require('@libsql/client');

// Validar variables antes de crear el cliente
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('[Turso DB] Variables de entorno no configuradas. Usando cliente mock.');
  module.exports = {
    execute: async () => ({ rows: [] }),
    batch: async () => [],
  };
  return;
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  try {
    await db.batch([
      `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price TEXT, category TEXT, hashtags TEXT, images TEXT NOT NULL DEFAULT '[]', published_at TEXT NOT NULL DEFAULT (datetime('now')), scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS social_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, network TEXT NOT NULL, post_id TEXT, status TEXT NOT NULL DEFAULT 'pending', error_msg TEXT, posted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`,
      `CREATE INDEX IF NOT EXISTS idx_social_posts_product ON social_posts(product_id)`
    ], "write");

    const defaults = {
      restaurant_name: process.env.RESTAURANT_NAME || 'Mi Restaurante',
      active_networks: JSON.stringify(['instagram', 'facebook', 'twitter', 'tiktok']),
    };

    for (const [k, v] of Object.entries(defaults)) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
        args: [k, v]
      });
    }
    console.log('[Turso DB] Inicialización completada.');
  } catch (error) {
    console.error('[Turso DB Error]', error.message);
    // No lanzar error para evitar crash en Vercel
  }
}

// Solo inicializar en entorno local, NO en Vercel serverless
if (!process.env.VERCEL) {
  initDB();
}

// Exportar también initDB para uso manual en server.js si es necesario
module.exports = db;
module.exports.initDB = initDB;