/**
 * js/upload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload Service module for Digital Art Studio website.
 * Prepares the frontend for Cloudflare Pages Functions.
 */

import { CONFIG } from './config.js';

/**
 * Upload files via the centralized upload endpoint.
 *
 * @param {File[]} files - List of user-selected files.
 * @param {function(number): void} [onProgress] - Optional progress callback (0 to 100).
 * @returns {Promise<string[]>} List of uploaded secure image URLs.
 */
export async function uploadImages(files, onProgress = null) {
  if (!files || files.length === 0) {
    throw new Error('No files provided for upload.');
  }

  // Create form data for multipart upload
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file, file.name);
  }

  if (onProgress) onProgress(10); // Start progress indicators

  try {
    const response = await fetch(CONFIG.UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData
    });

    if (onProgress) onProgress(80); // Processing on the server

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let errMsg = `Upload error (HTTP ${response.status})`;
      try {
        const errorJson = JSON.parse(rawText);
        errMsg = errorJson.error || errMsg;
      } catch (_) {
        if (rawText && rawText.length < 150) {
          errMsg = rawText;
        }
      }
      throw new Error(errMsg);
    }

    const resText = await response.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch (parseErr) {
      throw new Error('Failed to parse response from upload service.');
    }

    if (!data.imageUrls || !Array.isArray(data.imageUrls)) {
      throw new Error('Invalid response payload from upload service.');
    }

    if (onProgress) onProgress(100);

    return data.imageUrls;
  } catch (err) {
    console.error('[Upload Service] Image upload failure:', err);
    throw new Error(err.message || 'Image upload failed. Please try again.');
  }
}
