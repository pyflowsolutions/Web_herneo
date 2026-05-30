// backend/routes/products.js — API REST para productos
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { publishToNetworks } = require('../social');

const router = express.Router();

// ── Middleware de autenticación ──────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── GET /api/products — Listar todos los productos ────────
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    
    // Parsear el string JSON de imágenes de cada producto
    const parsed = products.map(p => ({
      ...p,
      images: JSON.parse(p.images || '[]')
    }));
    
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/products — Crear un nuevo producto (JSON / Base64) ──
router.post('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  
  try {
    // Extraemos los datos estructurados enviados por admin.html
    const { name, category, price, description, status, scheduled_at, images, networks } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre del producto es obligatorio' });
    }

    const id = Date.now().toString();
    const finalStatus = status || 'published';
    const imagesArray = images || []; // Viene como array de Base64 o URLs
    const imagesJson = JSON.stringify(imagesArray);

    // 1. Insertar el plato en la base de datos local SQLite
    db.prepare(`
      INSERT INTO products (id, name, category, price, description, status, scheduled_at, images)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, category, price, description, finalStatus, scheduled_at || null, imagesJson);

    // 2. PUBLICACIÓN INMEDIATA EN REDES SOCIALES (Telegram / Instagram)
    // Si el estado es "published" (en el acto) y el usuario marcó checkboxes:
    if (finalStatus === 'published' && networks && networks.length > 0) {
      console.log(`[social] Difundiendo plato "${name}" de inmediato en:`, networks);
      
      // Reconstruimos el objeto del producto simulado para pasarlo a tu script de redes sociales
      const productForSocial = {
        id,
        name,
        category,
        price,
        description,
        images: imagesArray
      };

      try {
        // Ejecutamos tu función oficial encargada de la API de las redes sociales
        await publishToNetworks(productForSocial, networks, db);
      } catch (socialErr) {
        console.error('[social-error] Falló la publicación en las redes:', socialErr.message);
        // No bloqueamos el flujo; devolvemos éxito para que el plato permanezca guardado en la web
      }
    }

    res.status(201).json({ message: '¡Plato creado y procesado con éxito!', id });

  } catch (err) {
    console.error('[products-router POST]', err.message);
    res.status(500).json({ error: 'Error interno al guardar el plato: ' + err.message });
  }
});

// ── PUT /api/products/:id — Modificar un producto existente ──
router.put('/:id', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { name, category, price, description, status, scheduled_at, images, networks } = req.body;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    const finalStatus = status || product.status;
    const imagesJson = images ? JSON.stringify(images) : product.images;

    // Actualizar base de datos
    db.prepare(`
      UPDATE products
      SET name = ?, category = ?, price = ?, description = ?, status = ?, scheduled_at = ?, images = ?
      WHERE id = ?
    `).run(
      name || product.name,
      category !== undefined ? category : product.category,
      price !== undefined ? price : product.price,
      description !== undefined ? description : product.description,
      finalStatus,
      scheduled_at || null,
      imagesJson,
      req.params.id
    );

    // Si al editar se fuerza la publicación inmediata de redes
    if (finalStatus === 'published' && networks && networks.length > 0) {
      const updatedProduct = {
        id: req.params.id,
        name: name || product.name,
        category: category !== undefined ? category : product.category,
        price: price !== undefined ? price : product.price,
        description: description !== undefined ? description : product.description,
        images: images || JSON.parse(product.images || '[]')
      };
      
      try {
        await publishToNetworks(updatedProduct, networks, db);
      } catch (socialErr) {
        console.error('[social-error-edit] Falló la publicación:', socialErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/products/:id — Eliminar un producto ────────
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

// ── GET /api/products/:id/social — Estado en redes sociales ─
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

// ── POST /api/products/:id/republish — Republicar en una red ──
router.post('/:id/republish', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { networks } = req.body;
  if (!networks?.length) return res.status(400).json({ error: 'Especifica las redes a republicar' });

  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    const flatProduct = {
      ...product,
      images: JSON.parse(product.images || '[]')
    };

    await publishToNetworks(flatProduct, networks, db);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
