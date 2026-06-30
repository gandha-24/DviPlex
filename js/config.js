/**
 * js/config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central configuration file for DviPlex website.
 * No API keys or secret credentials should be stored here.
 * All backend function URLs are configured in this single module.
 */

export const CONFIG = {
  // Cloudflare Pages Function / Netlify Function API Endpoints
  UPLOAD_ENDPOINT: '/.netlify/functions/upload-images',
  SAVE_ORDER_ENDPOINT: '/.netlify/functions/save-order',
  PAYMENT_ENDPOINT: '/.netlify/functions/start-payment',
  EMAIL_ENDPOINT: '/.netlify/functions/send-email',

  // Validation constants
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB per image

  // Global settings
  CURRENCY_SYMBOL: '₹',
  DEFAULT_DELIVERY_HOURS: 5
};
