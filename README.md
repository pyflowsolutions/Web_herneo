# 🎂 Dulce Atelier — Tienda + Publicación en Redes Sociales

Plataforma web completa para publicar tus dulces temáticos en tu tienda online y en Instagram, Facebook, Twitter/X y TikTok con un solo clic.

---

## 🗂️ Estructura del proyecto

```
restaurante-app/
├── backend/
│   ├── server.js          ← Servidor Express principal
│   ├── db.js              ← Base de datos SQLite
│   ├── social.js          ← Integración con APIs de redes sociales
│   └── routes/
│       ├── products.js    ← API REST de productos
│       ├── auth.js        ← Login / logout
│       └── stats.js       ← Estadísticas
├── frontend/
│   └── public/
│       ├── index.html     ← Tienda pública (catálogo de dulces)
│       ├── admin.html     ← Panel de administración
│       └── uploads/       ← Imágenes subidas (se crea automáticamente)
├── data/
│   └── restaurante.db     ← Base de datos SQLite (se crea automáticamente)
├── .env.example           ← Plantilla de variables de entorno
└── package.json
```

---

## 🚀 Instalación

### 1. Instalar dependencias

```bash
cd restaurante-app
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Abre `.env` y edita:
- `ADMIN_USER` y `ADMIN_PASS` → tus credenciales del panel admin
- `RESTAURANT_NAME` → el nombre de tu pastelería
- Las credenciales de cada red social (ver sección de APIs)

### 3. Arrancar el servidor

```bash
# Producción
npm start

# Desarrollo (recarga automática)
npm run dev
```

Abre tu navegador en:
- 🌐 **Tienda pública:** http://localhost:3000
- ⚙️ **Panel admin:** http://localhost:3000/admin

---

## 🌐 Configurar APIs de redes sociales

### Instagram & Facebook (Meta Graph API)

1. Ve a [developers.facebook.com](https://developers.facebook.com) y crea una app tipo "Empresa"
2. Añade el producto **Instagram Graph API**
3. Genera un **token de acceso de larga duración**
4. Obtén tu `INSTAGRAM_ACCOUNT_ID` desde la API: `GET /me/accounts`
5. Rellena en `.env`:
   ```
   INSTAGRAM_ACCESS_TOKEN=tu_token
   INSTAGRAM_ACCOUNT_ID=tu_id_de_cuenta
   FACEBOOK_ACCESS_TOKEN=mismo_token
   FACEBOOK_PAGE_ID=id_de_tu_pagina
   ```

> ⚠️ Requiere cuenta de Instagram de **Empresa o Creador** vinculada a una Página de Facebook.

### Twitter / X (API v2)

1. Ve a [developer.twitter.com](https://developer.twitter.com) y crea una app
2. Genera las 4 claves: API Key, API Secret, Access Token, Access Secret
3. Asegúrate de tener permisos de **lectura y escritura**
4. Rellena en `.env`:
   ```
   TWITTER_API_KEY=...
   TWITTER_API_SECRET=...
   TWITTER_ACCESS_TOKEN=...
   TWITTER_ACCESS_SECRET=...
   ```
5. Instala la dependencia extra: `npm install oauth-1.0a`

### TikTok (Content Posting API)

1. Ve a [developers.tiktok.com](https://developers.tiktok.com)
2. Solicita acceso a la **Content Posting API**
3. Genera un `access_token` mediante el flujo OAuth
4. Rellena en `.env`:
   ```
   TIKTOK_ACCESS_TOKEN=...
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   ```

---

## 📡 API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Listar productos (paginado, filtrable por categoría) |
| GET | `/api/products/:id` | Detalle de producto + estado en redes |
| POST | `/api/products` | Crear y publicar nuevo producto |
| PUT | `/api/products/:id` | Actualizar producto |
| DELETE | `/api/products/:id` | Eliminar producto + imágenes |
| POST | `/api/products/:id/republish` | Republicar en redes seleccionadas |
| GET | `/api/stats` | Estadísticas generales |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Verificar sesión activa |

### Ejemplo: publicar un nuevo dulce

```bash
curl -X POST http://localhost:3000/api/products \
  -F "name=Tarta de unicornio" \
  -F "description=Bizcocho de vainilla con buttercream de colores" \
  -F "price=42 €" \
  -F "category=Tartas temáticas" \
  -F "hashtags=#unicornio #pasteleria #artesanal" \
  -F "networks=instagram" \
  -F "networks=facebook" \
  -F "images=@/ruta/a/foto.jpg"
```

---

## 🌍 Despliegue en producción

### Con Railway (recomendado)

1. Crea una cuenta en [railway.app](https://railway.app)
2. Sube el proyecto a GitHub
3. Crea un nuevo proyecto en Railway desde el repositorio
4. Añade las variables de entorno en el panel de Railway
5. Railway asignará una URL pública — ponla en `PUBLIC_BASE_URL`

### Con VPS / servidor propio

```bash
# Instala PM2 para mantener el servidor vivo
npm install -g pm2
pm2 start backend/server.js --name dulce-atelier
pm2 startup
pm2 save
```

Configura Nginx como proxy inverso apuntando a `localhost:3000`.

---

## 🔒 Seguridad en producción

- Cambia `SESSION_SECRET` por una cadena aleatoria larga
- Usa HTTPS (Let's Encrypt con Certbot)
- Considera usar un hash bcrypt para `ADMIN_PASS` (el código ya importa bcryptjs)
- Añade rate limiting con `express-rate-limit`

---

## 📸 Flujo de una publicación

1. Admin sube fotos + rellena nombre, precio, descripción y categoría
2. Selecciona en qué redes publicar
3. Pulsa **Publicar ahora** (o programa para más tarde)
4. El servidor:
   - Guarda el producto en SQLite
   - Optimiza las imágenes con Sharp (WebP, máx. 1200px)
   - Publica simultáneamente en las redes seleccionadas
   - Registra el resultado (éxito/error) por red en la DB
5. El producto aparece al instante en la tienda pública
6. Las publicaciones en redes quedan registradas en Estadísticas

---

Hecho con ❤️ para **Dulce Atelier**
