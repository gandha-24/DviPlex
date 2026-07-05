/**
 * functions/api/get-order.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Retrieves order details.
 */

function respond(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const scriptUrl = env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return respond(500, {
      success: false,
      error: 'GOOGLE_SCRIPT_URL environment variable is not configured on the server.'
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order');

    if (!orderId) {
      return respond(400, {
        success: false,
        error: 'Query parameter "order" is required.'
      });
    }

    console.log(`[Get Order API] Retrieving details for order "${orderId}".`);

    // Call Apps Script with action=getOrder and orderId in post body
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getOrder', orderId: orderId }),
      redirect: 'follow'
    });

    const resText = await response.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) {}

    if (!response.ok || resData.success === false) {
      const scriptErr = resData?.error || resText || 'Apps Script order retrieval failed';
      console.error('[Get Order API] Apps Script returned error:', scriptErr);
      return respond(404, {
        success: false,
        error: `Order not found: ${scriptErr}`
      });
    }

    return respond(200, resData);

  } catch (err) {
    console.error('[Get Order API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
