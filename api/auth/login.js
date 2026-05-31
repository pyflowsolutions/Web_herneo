// api/auth/login.js - CommonJS para Vercel
module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { username, password } = req.body;
  const CONFIG_USER = process.env.ADMIN_USER;
  const CONFIG_PASS = process.env.ADMIN_PASS;

  if (username === CONFIG_USER && password === CONFIG_PASS) {
    return res.status(200).json({ authenticated: true, message: 'Acceso concedido' });
  } else {
    return res.status(401).json({ authenticated: false, message: 'Usuario o contraseña incorrectos' });
  }
};