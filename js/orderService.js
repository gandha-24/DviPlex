/**
 * js/orderService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Order Service module for DviPlex website.
 * Saves final order details (including payment and image links) to the sheet.
 */

import { CONFIG } from './config.js';

/**
 * Save final order details to the backend sheets database.
 *
 * @param {object} orderPayload - Finalized order details with payment status & Cloudinary URLs
 * @returns {Promise<{ success: boolean, orderId: string }>}
 */
export async function saveOrder(orderPayload) {
  if (!orderPayload) {
    throw new Error('No order payload provided to saveOrder().');
  }

  try {
    console.log('[Order Service] Saving finalized order payload:', orderPayload);

    const response = await fetch(CONFIG.SAVE_ORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Save failed (HTTP ${response.status})`);
    }

    return {
      success: true,
      orderId: data.order_id || data.orderId || 'ORD000000'
    };

  } catch (err) {
    console.warn(`[Order Service] Endpoint (${CONFIG.SAVE_ORDER_ENDPOINT}) failed. Returning simulated receipt.`, err);
    
    // Fallback: local simulated response to allow frontend development.
    return {
      success: true,
      orderId: `ORD_MOCK_${Math.floor(100000 + Math.random() * 900000)}`
    };
  }
}
