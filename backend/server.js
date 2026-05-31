// backend/server.js
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

// Importar DB de forma condicional
let db;
try {
  db = require('./db');
} catch (error) {
  console.warn('[Server] DB no disponible:', error.message);
  db = {
    execute: async () => ({ rows: [] }),
    batch: async () => {}
  };
}

const productsRouter = require('./routes/products');
const authRouter = require('./routes/auth');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Compartir DB con rutas ───────────────────────────────
app.locals.db = db;

// ── Middlewares ──────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuración de sesión
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-in-prod'],
  maxAge: 24 * 60 * 60 * 1000 // 24 horas
}));

// ── Archivos estáticos ────
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ───────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/stats', statsRouter);

// ── Servir HTMLs ────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
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

// ── Exportar para Vercel (Serverless) ───────────────────
module.exports = app;

// ── Solo escuchar en local (NO en Vercel) ───────────────
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  // Inicializar DB en local
  if (db && typeof db.batch === 'function') {
    const { initDB } = require('./db');
    initDB();
  }
  
  app.listen(PORT, () => {
    console.log(`\n🍽️ Restaurante Social Publisher Local`);
    console.log(`Sitio web: http://localhost:${PORT}`);
    console.log(`Panel admin: http://localhost:${PORT}/admin`);
  });
}
// Al final de server.js, después de module.exports = app:
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  // Solo en local: inicializar DB y arrancar servidor
  if (typeof db.initDB === 'function') {
    db.initDB();
  }
  app.listen(PORT, () => {
    console.log(`🍽️ Servidor local en http://localhost:${PORT}`);
  });
}
// En Vercel: NO llamar a listen(), solo exportar app