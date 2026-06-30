/**
 * netlify/functions/upload-images.js
 *
 * Netlify serverless function that receives multipart/form-data from the
 * DviPlex order page and uploads each image to Cloudinary.
 *
 * Environment variables required (set in Netlify dashboard or .env locally):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Request  : POST  multipart/form-data
 *   - orderId  : string   (used as the Cloudinary sub-folder)
 *   - images   : File[]   (one or more image files)
 *
 * Response : JSON
 *   Success → { urls: ["https://res.cloudinary.com/...", ...] }
 *   Failure → { error: "human-readable message" }            (4xx / 5xx)
 */

const cloudinary = require('cloudinary').v2;
const Busboy     = require('busboy');

/* ── Configure Cloudinary from env vars ───────────────────────────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/* ── Helper: upload a raw buffer to Cloudinary ────────────────────────── */
function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

/* ── Helper: parse multipart body with Busboy ─────────────────────────── */
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];

    let bb;
    try {
      bb = Busboy({ headers: { 'content-type': contentType } });
    } catch (err) {
      return reject(new Error('Invalid or missing Content-Type header.'));
    }

    const fields = {};
    const files  = []; // [{ fieldname, filename, mimetype, buffer }]

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];

      fileStream.on('data',  (chunk) => chunks.push(chunk));
      fileStream.on('end',   ()      => {
        files.push({
          fieldname,
          filename: filename || fieldname,
          mimetype: mimeType || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        });
      });
      fileStream.on('error', reject);
    });

    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error',  reject);

    // Netlify provides the body as a base64 string when isBase64Encoded is true
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '');

    bb.write(bodyBuffer);
    bb.end();
  });
}

/* ── Main handler ─────────────────────────────────────────────────────── */
exports.handler = async (event) => {
  /* Only accept POST */
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  /* Validate Cloudinary config */
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('[upload-images] Cloudinary env vars are not configured.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Upload service is not configured. Contact support.' }),
    };
  }

  /* Parse multipart form */
  let fields, files;
  try {
    ({ fields, files } = await parseMultipart(event));
  } catch (err) {
    console.error('[upload-images] Multipart parse error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Could not parse uploaded files: ${err.message}` }),
    };
  }

  if (!files || files.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No images were received.' }),
    };
  }

  /* Use orderId as the Cloudinary folder so uploads are organised */
  const orderId = (fields.orderId || 'no-order').replace(/[^a-zA-Z0-9_-]/g, '_');
  const folder  = `dviplex/orders/${orderId}`;

  /* Upload every image to Cloudinary in parallel */
  let results;
  try {
    results = await Promise.all(
      files.map((f) =>
        uploadBuffer(f.buffer, {
          folder,
          resource_type: 'image',
          // Let Cloudinary auto-detect format so HEIC / WEBP etc. work fine
          use_filename:      true,
          unique_filename:   true,
          overwrite:         false,
          // Strip GPS metadata for privacy
          exif:              false,
        })
      )
    );
  } catch (err) {
    console.error('[upload-images] Cloudinary upload error:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: 'Image upload to Cloudinary failed. Please try again.',
      }),
    };
  }

  const urls = results.map((r) => r.secure_url);
  console.log(`[upload-images] Order ${orderId}: uploaded ${urls.length} image(s).`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  };
};
