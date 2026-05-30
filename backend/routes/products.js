// backend/routes/products.js — API REST para productos
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { publishToNetworks } = require('../social');

const router = express.Router();

// ── Middleware de autenticación simple ───────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ─────────────────────────────────────────────────────────
// GET /api/products — Listar productos
// ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { category, status = 'published', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    let sql    = 'SELECT * FROM products WHERE status = ?';
    let params = [status];

    if (category) {
      sql    += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const products = db.prepare(sql).all(...params);
    
    const countSql = `SELECT COUNT(*) as n FROM products WHERE status = ? ${category ? 'AND category = ?' : ''}`;
    const countParams = category ? [status, category] : [status];
    const total = db.prepare(countSql).get(...countParams).n;

    products.forEach(p => { 
      p.images = JSON.parse(p.images || '[]'); 
    });

    res.json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/products/:id — Detalle de producto
// ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    product.images = JSON.parse(product.images || '[]');
    const posts = db.prepare(
      'SELECT network, status, error_msg, posted_at FROM social_posts WHERE product_id = ?'
    ).all(product.id);

    res.json({ ...product, social_posts: posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/products — Crear y publicar producto (JSON puro)
// ─────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;

  try {
    // Obtenemos los campos directos del cuerpo JSON enviados por el nuevo admin.html
    const { name, description, price, category, hashtags, networks, scheduled_at, images } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'El nombre del plato es obligatorio' });
    }

    const id = Date.now().toString();
    const isScheduled = !!scheduled_at;
    const status = isScheduled ? 'scheduled' : 'published';
    
    // Las imágenes llegan en un array de strings (Base64)
    const imagesArray = images || [];
    const imagesJson = JSON.stringify(imagesArray);

    // 1. Registrar el producto en la base de datos SQLite local
    db.prepare(`
      INSERT INTO products (id, name, description, price, category, hashtags, images, status, scheduled_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      description?.trim() || null,
      price?.trim() || null,
      category?.trim() || null,
      hashtags?.trim() || null,
      imagesJson,
      status,
      scheduled_at || null,
      isScheduled ? null : new Date().toISOString()
    );

    // Recuperamos el registro tal como quedó indexado
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    // 2. Resolver redes seleccionadas
    let selectedNetworks = [];
    if (networks) {
      selectedNetworks = Array.isArray(networks) ? networks : [networks];
    }

    // 3. DIFUSIÓN INMEDIATA EN REDES (Telegram, Instagram, etc.)
    let socialResults = [];
    if (!isScheduled && selectedNetworks.length > 0) {
      console.log(`[social] Publicando dulce "${name}" de inmediato en:`, selectedNetworks);
      
      // Construimos el objeto exacto emulando las imágenes mapeadas que espera tu motor social
      const productForSocial = {
        ...product,
        images: imagesArray
      };

      try {
        // Ejecuta tu lógica oficial de bots e integraciones API
        socialResults = await publishToNetworks(productForSocial, selectedNetworks, db);
      } catch (socialErr) {
        console.error('[social-error] Falló el hilo de publicación en redes:', socialErr.message);
      }
    }

    res.json({
      ok: true,
      product: { ...product, images: imagesArray },
      social: socialResults,
    });

  } catch (err) {
    console.error('[products] Error crítico al crear dulce:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/products/:id — Actualizar producto
// ─────────────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/products/:id — Eliminar producto
// ─────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/products/:id/social — Estado en redes sociales
// ─────────────────────────────────────────────────────────
router.get('/:id/social', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const posts = db.prepare(
      'SELECT * FROM social_posts WHERE product_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;