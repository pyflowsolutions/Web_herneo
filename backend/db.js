// backend/db.js — Inicialización de base de datos Turso (LibSQL)
const { createClient } = require('@libsql/client');

// Conexión dinámica usando las variables configuradas en el entorno de Vercel
// En local, caerá automáticamente a un archivo local de SQLite
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

// Adaptador para emular la interfaz de better-sqlite3 de forma asíncrona
const dbAdapter = {
  // Ejecución directa de bloques o scripts SQL sin parámetros
  exec: async (sql) => {
    return await db.execute(sql);
  },
  
  // Abstracción de prepare para evitar rehacer toda la lógica de los controladores y rutas
  prepare: (sql) => {
    // Reemplaza marcadores posicionales de SQLite (?) por el formato esperado por LibSQL si fuera necesario,
    // pero el cliente de Turso soporta nativamente el paso de argumentos posicionales en un array.
    return {
      run: async (params = []) => {
        const args = Array.isArray(params) ? params : [params];
        return await db.execute({ sql, args });
      },
      all: async (params = []) => {
        const args = Array.isArray(params) ? params : [params];
        const result = await db.execute({ sql, args });
        return result.rows; // Devuelve un array con los registros mapeados como objetos
      },
      get: async (params = []) => {
        const args = Array.isArray(params) ? params : [params];
        const result = await db.execute({ sql, args });
        return result.rows[0] || null; // Devuelve el primer elemento o null si no hay coincidencia
      }
    };
  }
};

// Inicialización asíncrona de la estructura de la base de datos en Turso
async function initDB() {
  try {
    // Creación de la tabla products
    await dbAdapter.exec(`
      CREATE TABLE IF NOT EXISTS products (
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
      );
    `);

    // Creación de la tabla social_posts
    await dbAdapter.exec(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        network     TEXT    NOT NULL,
        post_id     TEXT,
        status      TEXT    NOT NULL DEFAULT 'pending',
        error_msg   TEXT,
        posted_at   TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Creación de la tabla settings
    await dbAdapter.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Creación de índices optimizados
    await dbAdapter.exec(`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);`);
    await dbAdapter.exec(`CREATE INDEX IF NOT EXISTS idx_social_posts_product ON social_posts(product_id);`);

    // Inserción limpia de configuraciones por defecto
    const defaults = {
      restaurant_name: process.env.RESTAURANT_NAME || 'Mi Restaurante',
      active_networks: JSON.stringify(['instagram', 'facebook', 'twitter', 'tiktok']),
    };

    for (const [key, value] of Object.entries(defaults)) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
        args: [key, value]
      });
    }

    console.log('[Turso DB] Inicialización y verificación de esquema completada.');
  } catch (err) {
    console.error('[Turso DB Error]', err.message);
  }
}

// Ejecutamos la validación del esquema al importar el módulo
initDB();

module.exports = dbAdapter;
