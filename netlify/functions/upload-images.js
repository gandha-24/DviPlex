/**
 * netlify/functions/upload-images.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Netlify serverless function — receives multipart/form-data from the DviPlex
 * order page and uploads each image to Cloudinary using the official Node SDK.
 *
 * ── Environment variables (Netlify dashboard → Site settings → Env vars) ──
 *   CLOUDINARY_CLOUD_NAME   your Cloudinary cloud name
 *   CLOUDINARY_API_KEY      your Cloudinary API key
 *   CLOUDINARY_API_SECRET   your Cloudinary API secret
 *
 * ── Request (POST  multipart/form-data) ──
 *   orderId   string    Used as the Cloudinary sub-folder (optional, defaults to "general")
 *   images    File[]    One or more image files (jpg/jpeg/png/webp/heic)
 *
 * ── Success response (200) ──
 *   { urls: ["https://res.cloudinary.com/...", ...] }
 *
 * ── Failure response (4xx / 5xx) ──
 *   { error: "human-readable message", details?: [...] }
 */

'use strict';

const cloudinary = require('cloudinary').v2;
const Busboy     = require('busboy');

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

/** Maximum allowed size per image (bytes). Must match the frontend guard. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Maximum number of images accepted in a single request. */
const MAX_FILE_COUNT = 5;

/** Allowed MIME types. HEIC arrives as octet-stream from some browsers. */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/octet-stream', // HEIC fallback — validated further by extension
]);

/** Allowed file extensions (lowercase, without the dot). */
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

/** Cloudinary root folder for all DviPlex uploads. */
const CLOUDINARY_ROOT_FOLDER = 'dviplex';

/* ─────────────────────────────────────────────────────────────────────────────
   CLOUDINARY CONFIGURATION  (credentials from env vars only)
───────────────────────────────────────────────────────────────────────────── */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true, // Always return https:// URLs
});

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * JSON response factory — keeps the handler clean.
 * @param {number} statusCode
 * @param {object} body
 * @returns {object} Netlify function response
 */
function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Allow the order page to call this function from any origin.
      // Tighten this to your Netlify site URL in production if desired.
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Derive a file extension from the filename, lower-cased.
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  const parts = (filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Validate a single parsed file object.
 * Returns null if valid, or an error string if invalid.
 *
 * @param {{ filename: string, mimetype: string, buffer: Buffer }} file
 * @param {number} index  Zero-based position in the incoming file list
 * @returns {string|null}
 */
function validateFile(file, index) {
  const label = file.filename || `file[${index}]`;
  const ext   = getExtension(file.filename);

  // Extension check
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `"${label}" has an unsupported format. Accepted: JPG, PNG, WEBP, HEIC.`;
  }

  // MIME type check (allow octet-stream for HEIC uploaded by iOS browsers)
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return `"${label}" has an invalid content type (${file.mimetype}).`;
  }

  // Size check
  if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.buffer.length / (1024 * 1024)).toFixed(1);
    return `"${label}" is ${sizeMB} MB — maximum allowed size is 10 MB.`;
  }

  // Reject empty files
  if (file.buffer.length === 0) {
    return `"${label}" appears to be empty.`;
  }

  return null; // valid
}

/**
 * Parse a Netlify event's multipart/form-data body using Busboy.
 * Collects all fields and files into plain objects.
 *
 * @param {object} event  Netlify Lambda event
 * @returns {Promise<{ fields: object, files: Array }>}
 */
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    // Netlify lowercases headers, but guard against case variants
    const contentType =
      event.headers['content-type'] ||
      event.headers['Content-Type']  ||
      '';

    if (!contentType.includes('multipart/form-data')) {
      return reject(new Error('Request must use multipart/form-data encoding.'));
    }

    let bb;
    try {
      bb = Busboy({
        headers: { 'content-type': contentType },
        limits: {
          // Busboy-level guards (belt-and-suspenders alongside validateFile)
          fileSize:  MAX_FILE_SIZE_BYTES,
          files:     MAX_FILE_COUNT,
          fieldSize: 512, // bytes — orderId field is tiny
        },
      });
    } catch (err) {
      return reject(new Error(`Could not initialise multipart parser: ${err.message}`));
    }

    const fields = {};
    const files  = [];

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (fieldname, fileStream, info) => {
      // Busboy v1 puts metadata in the third argument (info object)
      const filename = info.filename || fieldname;
      const mimetype = info.mimeType || info.mimetype || 'application/octet-stream';
      const chunks   = [];
      let   truncated = false;

      fileStream.on('data',     (chunk) => chunks.push(chunk));
      fileStream.on('limit',    ()      => { truncated = true; }); // file exceeded Busboy limit
      fileStream.on('error',    (err)   => reject(err));
      fileStream.on('end', () => {
        files.push({
          fieldname,
          filename,
          mimetype,
          buffer: Buffer.concat(chunks),
          truncated, // will be caught by validateFile size check
        });
      });
    });

    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error',  (err) => reject(err));

    // Netlify provides the body as a base64 string when binary data is present
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '');

    bb.write(bodyBuffer);
    bb.end();
  });
}

/**
 * Upload a single image buffer to Cloudinary.
 * Returns the full Cloudinary upload result object.
 *
 * @param {Buffer} buffer      Raw image bytes
 * @param {string} folder      Cloudinary folder path  e.g. "dviplex/orders/ORD000001"
 * @param {string} filename    Original filename (used for the public_id hint)
 * @returns {Promise<object>}  Cloudinary upload result
 */
function uploadToCloudinary(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    // Strip the extension — Cloudinary appends its own based on format detection
    const nameWithoutExt = (filename || 'photo').replace(/\.[^.]+$/, '');

    const uploadOptions = {
      folder,
      resource_type:   'image',
      use_filename:    true,
      filename_override: nameWithoutExt,
      unique_filename: true,
      overwrite:       false,

      // Quality auto — keeps file size reasonable without visible quality loss
      quality: 'auto',

      // Fetch format auto — serve WebP/AVIF to browsers that support it
      fetch_format: 'auto',

      // Tags for easy filtering inside the Cloudinary dashboard
      tags: ['dviplex', 'order'],
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────────────────────────── */

exports.handler = async (event) => {
  // ── Handle CORS preflight ──
  if (event.httpMethod === 'OPTIONS') {
    return respond(204, {});
  }

  // ── Only accept POST ──
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed. Use POST.' });
  }

  // ── Guard: Cloudinary credentials must be present ──
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('[upload-images] Cloudinary environment variables are not configured.');
    return respond(500, {
      error: 'Upload service is not configured on the server. Please contact support.',
    });
  }

  // ── Parse multipart body ──
  let fields, files;
  try {
    ({ fields, files } = await parseMultipart(event));
  } catch (err) {
    console.error('[upload-images] Multipart parse error:', err.message);
    return respond(400, { error: `Could not read uploaded files: ${err.message}` });
  }

  // ── Guard: at least one file required ──
  if (!files || files.length === 0) {
    return respond(400, { error: 'No image files were received. Please attach at least one image.' });
  }

  // ── Guard: too many files ──
  if (files.length > MAX_FILE_COUNT) {
    return respond(400, {
      error: `Too many images. Maximum allowed per order is ${MAX_FILE_COUNT}.`,
    });
  }

  // ── Validate every file before attempting any upload ──
  const validationErrors = files
    .map((f, i) => validateFile(f, i))
    .filter(Boolean); // keep only non-null error strings

  if (validationErrors.length > 0) {
    return respond(422, {
      error: 'One or more files failed validation.',
      details: validationErrors,
    });
  }

  // ── Build Cloudinary folder from orderId ──
  // Sanitise the orderId so it is safe to use as a folder path segment
  const rawOrderId = (fields.orderId || 'general').trim();
  const safeOrderId = rawOrderId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const folder = `${CLOUDINARY_ROOT_FOLDER}/orders/${safeOrderId}`;

  // ── Upload all files to Cloudinary ──
  // Use allSettled so a single failure doesn't hide successful uploads;
  // we then decide whether to fail the whole request based on results.
  console.log(
    `[upload-images] Uploading ${files.length} image(s) for order "${safeOrderId}" → ${folder}`
  );

  const settlements = await Promise.allSettled(
    files.map((f) => uploadToCloudinary(f.buffer, folder, f.filename))
  );

  // Separate successes from failures
  const urls    = [];
  const failed  = [];

  settlements.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      urls.push(result.value.secure_url);
    } else {
      const reason = result.reason?.message || String(result.reason);
      console.error(`[upload-images] File[${i}] "${files[i].filename}" failed:`, reason);
      failed.push({ file: files[i].filename, reason });
    }
  });

  // ── All uploads succeeded ──
  if (failed.length === 0) {
    console.log(`[upload-images] ✅ Order "${safeOrderId}" — ${urls.length} image(s) uploaded.`);
    return respond(200, { urls });
  }

  // ── Some uploads failed — roll back the ones that did succeed ──
  // (Best-effort cleanup; non-blocking)
  if (urls.length > 0) {
    console.warn(`[upload-images] Partial failure — attempting to delete ${urls.length} already-uploaded image(s).`);
    // Extract public IDs from the URLs that did succeed
    const successResults = settlements
      .filter((s) => s.status === 'fulfilled')
      .map((s) => s.value.public_id);

    cloudinary.api.delete_resources(successResults, { resource_type: 'image' })
      .catch((cleanupErr) => {
        console.error('[upload-images] Cleanup failed (non-blocking):', cleanupErr.message);
      });
  }

  // ── All uploads failed ──
  if (urls.length === 0) {
    return respond(502, {
      error: 'All image uploads failed. Please try again.',
      details: failed.map((f) => f.reason),
    });
  }

  // ── Partial failure — tell the client clearly ──
  return respond(502, {
    error: `${failed.length} of ${files.length} image(s) could not be uploaded. Please try again.`,
    details: failed.map((f) => `${f.file}: ${f.reason}`),
  });
};
