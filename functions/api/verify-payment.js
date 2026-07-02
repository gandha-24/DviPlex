/**
 * functions/api/verify-payment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles order payment signature verification.
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

  const keySecret = env.RAZORPAY_KEY_SECRET;

  if (!keySecret) {
    return respond(500, {
      success: false,
      error: 'RAZORPAY_KEY_SECRET environment variable is not configured on the server.'
    });
  }

  try {
    const payload = await request.json();
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = payload;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return respond(400, {
        success: false,
        error: 'Missing required signature verification fields.'
      });
    }

    // Construct the data string for signature verification
    const message = `${razorpay_order_id}|${razorpay_payment_id}`;

    // Compute expected HMAC SHA-256 signature (in hex format)
    const expectedSignature = await hmacSha256Hex(message, keySecret);

    // Securely compare the received signature with the expected signature
    if (safeCompare(razorpay_signature, expectedSignature)) {
      return respond(200, {
        success: true
      });
    } else {
      return respond(400, {
        success: false,
        error: 'Payment verification failed.'
      });
    }

  } catch (err) {
    console.error('[Verify Payment API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}

/**
 * Computes the HMAC SHA-256 hash of a message using a secret key, returning a hex string.
 */
async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
