// backend/server.js — Servidor principal Express
require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));

// ── Archivos estáticos (imágenes subidas, CSS, JS) ──────
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// ── API Routes ───────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/auth',     authRouter);
app.use('/api/stats',    statsRouter);

// ── Página pública del restaurante ──────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

// ── ENRUTAMIENTO CORREGIDO PARA ADMIN (Lee directamente desde la raíz del repositorio) ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
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
    const due = db.prepare(`
      SELECT * FROM products
      WHERE status = 'scheduled' AND scheduled_at <= ?
    `).all(now);

    for (const product of due) {
      console.log(`[scheduler] Publicando plato programado: ${product.name}`);
      const settingsRow = db.prepare("SELECT value FROM settings WHERE key='active_networks'").get();
      const nets = JSON.parse(settingsRow?.value || '["telegram"]');
      
      await publishToNetworks(product, nets, db);
      db.prepare(
        "UPDATE products SET status='published', published_at=? WHERE id=?"
      ).run(now, product.id);
    }
  } catch (err) {
    console.error('[scheduler-error]', err.message);
  }
}, 60 * 1000); // Comprueba cada minuto

// ── Arranque del servidor local (Solo si no estamos en Vercel) ──
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`\n🍽️  Restaurante Social Publisher Local`);
    console.log(`   Sitio web:     http://localhost:${PORT}`);
    console.log(`   Panel admin:   http://localhost:${PORT}/admin`);
    console.log(`   API REST:      http://localhost:${PORT}/api/products\n`);
  });
}

// ── EXPORTACIÓN OBLIGATORIA PARA VERCEL ──────────────────
module.exports = app;