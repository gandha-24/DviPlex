/**
 * functions/api/start-payment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles order payment initiation.
 * Connects to Razorpay REST API or falls back to mock mode if credentials are empty.
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

  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;

  try {
    const payload = await request.json();
    const amount = parseFloat(payload.amount);

    if (isNaN(amount) || amount <= 0) {
      return respond(400, { success: false, error: 'Invalid transaction amount.' });
    }

    // Check if Razorpay keys are configured
    if (!keyId || !keySecret) {
      console.warn('[Payment API] Razorpay key_id or key_secret is missing. Falling back to Mock Payment.');
      return respond(200, {
        success: true,
        paymentId: `PAY_MOCK_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        orderId: ''
      });
    }

    // Call Razorpay API to create an order
    const amountInPaise = Math.round(amount * 100);
    const razorpayPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rec_${Date.now()}`
    };

    // Generate Basic auth header (Base64 encoding key_id:key_secret)
    const credentials = btoa(`${keyId}:${keySecret}`);
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(razorpayPayload)
    });

    const resText = await res.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) { }

    if (!res.ok) {
      console.error('[Payment API] Razorpay returned error:', resText);

      return respond(500, {
        success: false,
        error: resText || "Unable to create Razorpay order."
      });
    }

    return respond(200, {
      success: true,
      key: keyId,
      orderId: resData.id,
      amount: resData.amount,
      currency: resData.currency
    });

  } catch (err) {
    console.error('[Payment API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
