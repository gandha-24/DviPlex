/**
 * upload.js — DviPlex image upload module
 *
 * Sends one or more File objects to the Netlify serverless function
 * (/.netlify/functions/upload-images), which in turn uploads them to
 * Cloudinary and returns the final secure URLs.
 *
 * Usage:
 *   import { uploadImages } from './js/upload.js';
 *
 *   const urls = await uploadImages(files, {
 *     orderId:    'ORD000042',
 *     onProgress: (pct) => console.log(`${pct}% uploaded`),
 *   });
 *   // urls → ["https://res.cloudinary.com/...", ...]
 */

const UPLOAD_ENDPOINT = '/.netlify/functions/upload-images';

/**
 * Upload an array of File objects via the Netlify function.
 *
 * @param {File[]}  files            - Files selected by the user.
 * @param {object}  options
 * @param {string}  options.orderId  - Order ID used as the Cloudinary folder name.
 * @param {function(number):void} [options.onProgress]
 *        Called with an integer 0‑100 as each file finishes uploading
 *        (progress is estimated by file count, not byte count).
 *
 * @returns {Promise<string[]>}  Array of Cloudinary HTTPS image URLs.
 * @throws  {Error}              If the function returns an error or the network fails.
 */
export async function uploadImages(files, { orderId = 'unknown', onProgress = null } = {}) {
  if (!files || files.length === 0) {
    throw new Error('No files provided to uploadImages().');
  }

  // Build a single multipart form with all images so one round-trip handles
  // every file. The function returns all URLs at once.
  const formData = new FormData();
  formData.append('orderId', orderId);

  for (const file of files) {
    formData.append('images', file, file.name);
  }

  // Signal 0 % before the request starts
  onProgress && onProgress(0);

  let response;
  try {
    response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
      // Note: do NOT set Content-Type manually when sending FormData —
      // the browser must set it with the correct boundary string.
    });
  } catch (networkErr) {
    throw new Error(
      `Network error while uploading photos: ${networkErr.message}. ` +
      'Please check your internet connection and try again.'
    );
  }

  // Signal 80 % after server responds (parsing / Cloudinary upload is done)
  onProgress && onProgress(80);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Unexpected response from upload server (status ${response.status}). ` +
      'Please try again.'
    );
  }

  if (!response.ok) {
    // The function returned a structured error
    const reason = data?.error || `HTTP ${response.status}`;
    throw new Error(`Upload failed: ${reason}`);
  }

  if (!Array.isArray(data?.urls) || data.urls.length === 0) {
    throw new Error('Upload server returned an invalid response (no URLs).');
  }

  // Signal 100 %
  onProgress && onProgress(100);

  return data.urls;
}
