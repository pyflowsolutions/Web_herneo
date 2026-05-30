// backend/routes/stats.js — Estadísticas del panel
const express = require('express');
const router  = express.Router();

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// GET /api/stats — Resumen general
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;

  const totalProducts = db.prepare(
    "SELECT COUNT(*) as n FROM products WHERE status = 'published'"
  ).get().n;

  const thisMonth = db.prepare(`
    SELECT COUNT(*) as n FROM products
    WHERE status = 'published'
      AND strftime('%Y-%m', published_at) = strftime('%Y-%m', 'now')
  `).get().n;

  const byNetwork = db.prepare(`
    SELECT network, 
           COUNT(*) as total,
           SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) as ok,
           SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
    FROM social_posts GROUP BY network
  `).all();

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as n
    FROM products WHERE status = 'published'
    GROUP BY category ORDER BY n DESC
  `).all();

  const recentActivity = db.prepare(`
    SELECT sp.network, sp.status, sp.error_msg, sp.posted_at,
           p.name as product_name
    FROM social_posts sp
    JOIN products p ON sp.product_id = p.id
    ORDER BY sp.created_at DESC LIMIT 20
  `).all();

  const scheduled = db.prepare(
    "SELECT COUNT(*) as n FROM products WHERE status = 'scheduled'"
  ).get().n;

  res.json({
    totalProducts,
    thisMonth,
    scheduled,
    byNetwork,
    byCategory,
    recentActivity,
  });
});

module.exports = router;
