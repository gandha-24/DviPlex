/**
 * js/emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Email Notification Service for Digital Art Studio website.
 * Placeholder to send transactional notification emails.
 */

import { CONFIG } from './config.js';

/**
 * Trigger backend order confirmation email dispatch.
 * Currently works as a modular placeholder.
 *
 * @param {object} order - Saved order object containing customer details
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendConfirmationEmail(order) {
  console.log('[Email Service] Trigger confirmation email request for:', order?.email);

  try {
    const response = await fetch(CONFIG.EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data && data.success) {
        console.log('[Email Service] Email API triggered successfully.');
        return { success: true };
      }
    }
  } catch (err) {
    console.error('[Email Service] Email endpoint failure:', err);
  }

  return { success: false };
}
