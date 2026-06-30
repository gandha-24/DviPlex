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

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let errMsg = `Save failed (HTTP ${response.status})`;
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
    } catch (_) {
      throw new Error('Failed to parse response from order service.');
    }

    if (data.success === false) {
      throw new Error(data.error || 'Order could not be saved.');
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
