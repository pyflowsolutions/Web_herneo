// backend/routes/products.js — API REST para productos
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const { publishToNetworks } = require('../social');

const router = express.Router();

// ── Middleware de autenticación simple ───────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── Configuración de subida de imágenes ─────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// ── Helper para optimizar imágenes con sharp ─────────────
async function optimizeImage(filePath) {
  const optimized = filePath.replace(/(\.\w+)$/, '-opt.webp');
  await sharp(filePath)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(optimized);
  fs.unlinkSync(filePath); // elimina el original
  return optimized;
}

// ─────────────────────────────────────────────────────────
// GET /api/products — Listar productos
// ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { category, status = 'published', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let sql    = 'SELECT * FROM products WHERE status = ?';
  let params = [status];

  if (category) {
    sql    += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), offset);

  const products = db.prepare(sql).all(...params);
  const total    = db.prepare(
    `SELECT COUNT(*) as n FROM products WHERE status = ?${category ? ' AND category = ?' : ''}`
  ).get(...(category ? [status, category] : [status])).n;

  products.forEach(p => { p.images = JSON.parse(p.images || '[]'); });

  res.json({ products, total, page: Number(page), limit: Number(limit) });
});

// ─────────────────────────────────────────────────────────
// GET /api/products/:id — Detalle de producto
// ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  product.images = JSON.parse(product.images || '[]');
  const posts = db.prepare(
    'SELECT network, status, error_msg, posted_at FROM social_posts WHERE product_id = ?'
  ).all(product.id);

  res.json({ ...product, social_posts: posts });
});

// ─────────────────────────────────────────────────────────
// POST /api/products — Crear y publicar producto
// ─────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.array('images', 10), async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { name, description, price, category, hashtags, networks, scheduled_at } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'El nombre del plato es obligatorio' });
    }

    // Optimizar imágenes
    const imagePaths = [];
    for (const file of (req.files || [])) {
      try {
        const optimized = await optimizeImage(file.path);
        // Guardar la ruta relativa a /public
        imagePaths.push('uploads/' + path.basename(optimized));
      } catch {
        // Si sharp falla (imagen no optimizable), usar original
        imagePaths.push('uploads/' + path.basename(file.path));
      }
    }

    // Parsear redes seleccionadas
    let selectedNetworks = [];
    if (networks) {
      selectedNetworks = Array.isArray(networks) ? networks : [networks];
    }

    const isScheduled = !!scheduled_at;
    const status = isScheduled ? 'scheduled' : 'published';

    // Insertar producto en DB
    const result = db.prepare(`
      INSERT INTO products (name, description, price, category, hashtags, images, status, scheduled_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      description?.trim() || null,
      price?.trim() || null,
      category?.trim() || null,
      hashtags?.trim() || null,
      JSON.stringify(imagePaths),
      status,
      scheduled_at || null,
      isScheduled ? null : new Date().toISOString()
    );

    const productId = result.lastInsertRowid;
    const product   = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    // Publicar en redes (si no es programado)
    let socialResults = [];
    if (!isScheduled && selectedNetworks.length > 0) {
      socialResults = await publishToNetworks(product, selectedNetworks, db);
    }

    res.json({
      ok: true,
      product: { ...product, images: JSON.parse(product.images) },
      social: socialResults,
    });

  } catch (err) {
    console.error('[products] Error al crear producto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/products/:id — Actualizar producto
// ─────────────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { name, description, price, category, hashtags } = req.body;

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, category=?, hashtags=?
    WHERE id=?
  `).run(
    name || existing.name,
    description ?? existing.description,
    price ?? existing.price,
    category ?? existing.category,
    hashtags ?? existing.hashtags,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  updated.images = JSON.parse(updated.images || '[]');
  res.json({ ok: true, product: updated });
});

// ─────────────────────────────────────────────────────────
// DELETE /api/products/:id — Eliminar producto
// ─────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  // Eliminar imágenes del disco
  const images = JSON.parse(product.images || '[]');
  images.forEach(img => {
    const full = path.join(__dirname, '..', '..', 'frontend', 'public', img);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  });

  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────
// GET /api/products/:id/social — Estado en redes sociales
// ─────────────────────────────────────────────────────────
router.get('/:id/social', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const posts = db.prepare(
    'SELECT * FROM social_posts WHERE product_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ posts });
});

// ─────────────────────────────────────────────────────────
// POST /api/products/:id/republish — Republicar en una red
// ─────────────────────────────────────────────────────────
router.post('/:id/republish', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { networks } = req.body;
  if (!networks?.length) return res.status(400).json({ error: 'Especifica las redes a republicar' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const results = await publishToNetworks(product, networks, db);
  res.json({ ok: true, social: results });
});

module.exports = router;
