// backend/routes/stats.js — Estadísticas del panel (Adaptado para Turso)
const express = require('express');
const router  = express.Router();

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// GET /api/stats — Resumen general
router.get('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const totalProductsRes = await db.execute(
      "SELECT COUNT(*) as n FROM products WHERE status = 'published'"
    );
    const totalProducts = totalProductsRes.rows[0]?.n || 0;

    const thisMonthRes = await db.execute(`
      SELECT COUNT(*) as n FROM products
      WHERE status = 'published'
        AND strftime('%Y-%m', published_at) = strftime('%Y-%m', 'now')
    `);
    const thisMonth = thisMonthRes.rows[0]?.n || 0;

    const byNetworkRes = await db.execute(`
      SELECT network, 
             COUNT(*) as total,
             SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) as ok,
             SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
      FROM social_posts GROUP BY network
    `);
    const byNetwork = byNetworkRes.rows;

    const byCategoryRes = await db.execute(`
      SELECT category, COUNT(*) as n
      FROM products WHERE status = 'published'
      GROUP BY category ORDER BY n DESC
    `);
    const byCategory = byCategoryRes.rows;

    const recentActivityRes = await db.execute(`
      SELECT sp.network, sp.status, sp.error_msg, sp.posted_at,
             p.name as product_name
      FROM social_posts sp
      JOIN products p ON sp.product_id = p.id
      ORDER BY sp.created_at DESC LIMIT 20
    `);
    const recentActivity = recentActivityRes.rows;

    const scheduledRes = await db.execute(
      "SELECT COUNT(*) as n FROM products WHERE status = 'scheduled'"
    );
    const scheduled = scheduledRes.rows[0]?.n || 0;

    res.json({
      totalProducts,
      thisMonth,
      scheduled,
      byNetwork,
      byCategory,
      recentActivity,
    });
  } catch (err) {
    console.error('[stats-error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
