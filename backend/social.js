// backend/social.js — Servicio de publicación en redes sociales (Adaptado para Turso)
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function postInstagram({ imageUrl, caption }) {
  const { INSTAGRAM_ACCESS_TOKEN: token, INSTAGRAM_ACCOUNT_ID: accountId } = process.env;
  if (!token || !accountId) throw new Error('Credenciales de Instagram no configuradas');

  const containerRes = await axios.post(
    `https://graph.instagram.com/v19.0/${accountId}/media`,
    { image_url: imageUrl, caption, access_token: token }
  );
  const creationId = containerRes.data.id;

  const publishRes = await axios.post(
    `https://graph.instagram.com/v19.0/${accountId}/media_publish`,
    { creation_id: creationId, access_token: token }
  );
  return publishRes.data.id;
}

async function postFacebook({ imageUrl, caption }) {
  const { FACEBOOK_ACCESS_TOKEN: token, FACEBOOK_PAGE_ID: pageId } = process.env;
  if (!token || !pageId) throw new Error('Credenciales de Facebook no configuradas');

  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    { url: imageUrl, caption, access_token: token }
  );
  return res.data.id;
}

async function postTwitter({ imagePath, caption }) {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;
  if (!TWITTER_API_KEY) throw new Error('Credenciales de Twitter no configuradas');

  let OAuth;
  try { OAuth = require('oauth-1.0a'); } catch {
    throw new Error('Instala oauth-1.0a: npm install oauth-1.0a crypto');
  }

  const crypto = require('crypto');
  const oauth = OAuth({
    consumer: { key: TWITTER_API_KEY, secret: TWITTER_API_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function: (base, key) =>
      crypto.createHmac('sha1', key).update(base).digest('base64'),
  });
  const token = { key: TWITTER_ACCESS_TOKEN, secret: TWITTER_ACCESS_SECRET };

  const imageData = fs.readFileSync(imagePath).toString('base64');
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const authUpload = oauth.toHeader(oauth.authorize({ url: uploadUrl, method: 'POST' }, token));
  const uploadForm = new FormData();
  uploadForm.append('media_data', imageData);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...authUpload },
    body: uploadForm,
  });
  const uploadJson = await uploadRes.json();
  const mediaId = uploadJson.media_id_string;

  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({
    text: caption.substring(0, 280),
    media: { media_ids: [mediaId] },
  });
  const authTweet = oauth.toHeader(oauth.authorize({ url: tweetUrl, method: 'POST' }, token));
  const tweetRes = await fetch(tweetUrl, {
    method: 'POST',
    headers: { ...authTweet, 'Content-Type': 'application/json' },
    body,
  });
  const tweetJson = await tweetRes.json();
  return tweetJson.data?.id;
}

async function postTikTok({ imagePaths, caption }) {
  const { TIKTOK_ACCESS_TOKEN: token } = process.env;
  if (!token) throw new Error('Credenciales de TikTok no configuradas');

  const res = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/content/init/',
    {
      post_info: { title: caption.substring(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE' },
      source_info: {
        source: 'FILE_UPLOAD',
        photo_cover_index: 0,
        photo_images: imagePaths.map(p => fs.readFileSync(p).toString('base64')),
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return res.data.data?.publish_id;
}

/**
 * Publica un producto en las redes seleccionadas (Adaptado para Turso)
 */
async function publishToNetworks(product, networks, db) {
  const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const images  = JSON.parse(product.images || '[]');
  const firstImageUrl  = images.length ? `${baseUrl}/${images[0]}` : null;
  const firstImagePath = images.length ? path.join(__dirname, '..', images[0]) : null;

  const caption = [
    product.name,
    product.price ? `💰 ${product.price}` : '',
    product.description || '',
    product.hashtags || '',
  ].filter(Boolean).join('\n\n');

  const results = [];

  for (const network of networks) {
    const row = { product_id: product.id, network, status: 'pending' };

    try {
      let postId;
      switch (network) {
        case 'instagram':
          if (!firstImageUrl) throw new Error('Se requiere al menos una imagen para Instagram');
          postId = await postInstagram({ imageUrl: firstImageUrl, caption });
          break;
        case 'facebook':
          if (!firstImageUrl) throw new Error('Se requiere al menos una imagen para Facebook');
          postId = await postFacebook({ imageUrl: firstImageUrl, caption });
          break;
        case 'twitter':
          if (!firstImagePath) throw new Error('Se requiere al menos una imagen para Twitter');
          postId = await postTwitter({ imagePath: firstImagePath, caption });
          break;
        case 'tiktok':
          if (!images.length) throw new Error('Se requiere al menos una imagen para TikTok');
          postId = await postTikTok({
            imagePaths: images.map(i => path.join(__dirname, '..', i)),
            caption,
          });
          break;
        default:
          throw new Error(`Red no reconocida: ${network}`);
      }

      row.status   = 'ok';
      row.post_id  = postId || null;
      row.posted_at = new Date().toISOString();
      results.push({ network, ok: true, postId });

    } catch (err) {
      row.status    = 'error';
      row.error_msg = err.message;
      results.push({ network, ok: false, error: err.message });
      console.error(`[social] Error en ${network}:`, err.message);
    }

    // Adaptado al execute asíncrono de Turso
    await db.execute({
      sql: `INSERT INTO social_posts (product_id, network, post_id, status, error_msg, posted_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        row.product_id,
        row.network,
        row.post_id || null,
        row.status,
        row.error_msg || null,
        row.posted_at || null
      ]
    });
  }

  return results;
}

module.exports = { publishToNetworks };