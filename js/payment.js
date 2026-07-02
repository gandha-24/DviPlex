/**
 * js/payment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Payment Service module for Digital Art Studio website.
 * Handles Razorpay API checkout and verification.
 */

import { CONFIG } from './config.js';
import { showLoading, hideLoading } from './utils.js';

/**
 * Start the payment checkout process.
 * Connects to the Cloudflare Pages Functions payment API,
 * generates a Razorpay order, triggers the Razorpay checkout overlay modal,
 * and awaits payment verification.
 *
 * @param {object} order - Clean order payload (excluding uploaded image URLs)
 * @returns {Promise<{ success: boolean, paymentId: string, orderId: string }>}
 */
export async function startPayment(order) {
  if (!order) {
    throw new Error('Invalid order payload for checkout.');
  }

  console.log('[Payment Service] Initiating Razorpay order creation for:', order);

  // 1. Call start-payment API to get Razorpay order details
  const response = await fetch(CONFIG.PAYMENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Number(order.product_price),
      customerName: order.name,
      email: order.email,
      whatsapp: order.whatsapp_number
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errText = errData.error || `HTTP error ${response.status}`;
    throw new Error(errText);
  }

  const paymentData = await response.json();
  if (!paymentData || !paymentData.success) {
    throw new Error(paymentData?.error || 'Failed to create payment order.');
  }

  const { key, orderId, amount, currency } = paymentData;

  // We hide the loader overlay while Razorpay UI is active.
  hideLoading();

  // 2. Open Razorpay Checkout popup and return a promise
  return new Promise((resolve, reject) => {
    const options = {
      key: key,
      amount: amount,
      currency: currency,
      name: "Digital Art Studio",
      description: order.product_name || "Custom Digital Portrait",
      order_id: orderId,
      prefill: {
        name: order.name,
        email: order.email,
        contact: order.whatsapp_number
      },
      theme: {
        color: "#7F77DD" // brand purple accent color
      },
      notes: {
        order_id: orderId
      },
      handler: async function (response) {
        // Step 3: Trigger payment verification loader overlay
        showLoading('Payment Verification...');
        try {
          const verifyRes = await verifyPayment(response);
          if (verifyRes && verifyRes.success) {
            resolve({
              success: true,
              paymentId: response.razorpay_payment_id,
              orderId: orderId
            });
          } else {
            reject(new Error("Payment verification failed."));
          }
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: function () {
          reject(new Error("Payment cancelled."));
        }
      }
    };

    const rzp = new window.Razorpay(options);

    rzp.on('payment.failed', function (resp) {
      reject(new Error(resp.error.description || "Payment failed. Please try again."));
    });

    rzp.open();
  });
}

/**
 * Verify payment with backend signature verification.
 * 
 * @param {object} rzpResponse - Response from Razorpay containing signature, payment_id, and order_id
 * @returns {Promise<{ success: boolean }>}
 */
async function verifyPayment(rzpResponse) {
  const response = await fetch(CONFIG.VERIFY_PAYMENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_payment_id: rzpResponse.razorpay_payment_id,
      razorpay_order_id: rzpResponse.razorpay_order_id,
      razorpay_signature: rzpResponse.razorpay_signature
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errText = errData.error || `Verification failed with status ${response.status}`;
    throw new Error(errText);
  }

  const data = await response.json();
  return data;
}
