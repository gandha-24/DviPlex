/**
 * functions/api/upload-images.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles image uploads.
 * Parses multipart form-data natively, validates constraints, signs the request,
 * and streams files to Cloudinary using fetch.
 */

// Allowed extensions and MIME types
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Generate a Cloudinary SHA-1 signature.
 * Sorted alphabetically: key1=val1&key2=val2...<api_secret>
 */
async function generateSignature(params, apiSecret) {
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build standard JSON response with CORS headers.
 */
function respond(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Read Cloudinary configs from environment variables
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  const uploadPreset = env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !apiKey || !apiSecret) {
    return respond(500, {
      success: false,
      error: 'Cloudinary environment variables are not configured on the server.'
    });
  }

  try {
    const formData = await request.formData();
    const images = formData.getAll('images');
    const tempId = formData.get('orderId') || 'general';

    if (!images || images.length === 0) {
      return respond(400, { success: false, error: 'No files provided.' });
    }

    const imageUrls = [];

    // Process each image sequentially (Cloudinary API limits concurrency per-connection)
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const filename = file.name || `photo_${i}`;
      const ext = filename.split('.').pop().toLowerCase();

      // Validate extension & type
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return respond(422, { success: false, error: `"${filename}" has an unsupported format.` });
      }
      if (!ALLOWED_MIMES.has(file.type)) {
        return respond(422, { success: false, error: `"${filename}" has an invalid content type.` });
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        return respond(422, { success: false, error: `"${filename}" exceeds the 10 MB size limit.` });
      }

      // Construct folder path
      const safeFolder = `Digital Art Studio/orders/${String(tempId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      // Sign the upload request parameters
      const timestamp = Math.round(Date.now() / 1000);
      const paramsToSign = {
        folder: safeFolder,
        timestamp: timestamp
      };

      if (uploadPreset) {
        paramsToSign.upload_preset = uploadPreset;
      }

      const signature = await generateSignature(paramsToSign, apiSecret);

      // Construct payload for Cloudinary API
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('api_key', apiKey);
      uploadFormData.append('timestamp', String(timestamp));
      uploadFormData.append('folder', safeFolder);
      uploadFormData.append('signature', signature);
      if (uploadPreset) {
        uploadFormData.append('upload_preset', uploadPreset);
      }

      // Perform upload request to Cloudinary API
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: uploadFormData
      });

      const resText = await res.text();
      let resData = {};
      try {
        resData = JSON.parse(resText);
      } catch (_) { }

      if (!res.ok) {
        const cloudErr = resData?.error?.message || resText || 'Cloudinary upload failed';
        return respond(502, {
          success: false,
          error: `Cloudinary error for "${filename}": ${cloudErr}`
        });
      }

      if (!resData.secure_url) {
        return respond(502, {
          success: false,
          error: `Could not retrieve secure URL for "${filename}".`
        });
      }

      imageUrls.push(resData.secure_url);
    }

    return respond(200, {
      success: true,
      imageUrls: imageUrls
    });

  } catch (err) {
    console.error('[Upload API] Request processing error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
