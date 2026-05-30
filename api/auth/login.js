// api/auth/login.js

export default function handler(req, res) {
  // Solo permitimos peticiones POST por seguridad
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { username, password } = req.body;

  // Obtenemos las credenciales seguras de las variables de entorno de Vercel
  const CONFIG_USER = process.env.ADMIN_USER;
  const CONFIG_PASS = process.env.ADMIN_PASS;

  // Verificamos si coinciden
  if (username === CONFIG_USER && password === CONFIG_PASS) {
    // Aquí devolvemos un estado correcto. 
    // Puedes implementar tokens o cookies si lo requieres más adelante.
    return res.status(200).json({ authenticated: true, message: 'Acceso concedido' });
  } else {
    // Credenciales incorrectas
    return res.status(401).json({ authenticated: false, message: 'Usuario o contraseña incorrectos' });
  }
}
