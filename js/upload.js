/**
 * js/upload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload Service module for DviPlex website.
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

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error || `Upload error (HTTP ${response.status})`;
      throw new Error(errorMsg);
    }

    if (!data.urls || !Array.isArray(data.urls)) {
      throw new Error('Invalid response payload from upload service.');
    }

    if (onProgress) onProgress(100);

    return data.urls;
  } catch (err) {
    console.error('[Upload Service] Image upload failure:', err);
    throw new Error(err.message || 'Image upload failed. Please try again.');
  }
}
