// backend/routes/auth.js — Autenticación del panel admin
const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.ADMIN_USER;
  const validPass = password === process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  req.session.authenticated = true;
  req.session.user = username;
  res.json({ ok: true, user: username });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session?.authenticated) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;