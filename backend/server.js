// backend/server.js — Servidor principal Express (Estructura Sincronizada con Frontend)
require('dotenv').config();

const express        = require('express');
const cookieSession  = require('cookie-session'); // Cambiado a cookie-session para compatibilidad con Vercel
const path           = require('path');
const db             = require('./db');

const productsRouter = require('./routes/products');
const authRouter     = require('./routes/auth');
const statsRouter    = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Compartir DB con rutas ───────────────────────────────
app.locals.db = db;

// ── Middlewares ──────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuración de sesión segura e independiente de la memoria RAM del servidor
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-in-prod'],
  maxAge: 24 * 60 * 60 * 1000 // 24 horas
}));

// ── Archivos estáticos apuntando a la carpeta frontend y raíz ──
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ───────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/auth',     authRouter);
app.use('/api/stats',    statsRouter);

// ── Servir HTMLs mapeados correctamente desde la carpeta frontend ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// ── Manejo de errores ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo es demasiado grande (máx. 15 MB)' });
  }
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ── Tarea programada: publicar productos programados ────
setInterval(async () => {
  const { publishToNetworks } = require('./social');
  const now = new Date().toISOString();
  try {
    const dueRes = await db.execute({
      sql: "SELECT * FROM products WHERE status = 'scheduled' AND scheduled_at <= ?",
      args: [now]
    });
    const due = dueRes.rows;

    for (const product of due) {
      console.log(`[scheduler] Publicando plato programado: ${product.name}`);
      const settingsRes = await db.execute({
        sql: "SELECT value FROM settings WHERE key='active_networks'",
        args: []
      });
      const settingsRow = settingsRes.rows[0];
      const nets = JSON.parse(settingsRow?.value || '["telegram"]');
      
      await publishToNetworks(product, nets, db);
      await db.execute({
        sql: "UPDATE products SET status='published', published_at=? WHERE id=?",
        args: [now, product.id]
      });
    }
  } catch (err) {
    console.error('[scheduler-error]', err.message);
  }
}, 60 * 1000);

// Arranque del servidor local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`\n🍽️  Restaurante Social Publisher Local`);
    console.log(`   Sitio web:     http://localhost:${PORT}`);
    console.log(`   Panel admin:   http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
