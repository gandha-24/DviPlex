/**
 * functions/api/save-order.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles order sheet persistence.
 * Forwards the payload to the Google Apps Script Web App URL.
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

  const scriptUrl = env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return respond(500, {
      success: false,
      error: 'GOOGLE_SCRIPT_URL environment variable is not configured on the server.'
    });
  }

  try {
    const orderPayload = await request.json();

    if (!orderPayload.name || !orderPayload.email) {
      return respond(400, {
        success: false,
        error: 'Payload is missing required name or email fields.'
      });
    }

    console.log(`[Save Order API] Forwarding customer "${orderPayload.name}" order to Apps Script.`);

    // Call Google Apps Script Web App URL
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
      redirect: 'follow'
    });

    const resText = await response.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) {}

    if (!response.ok || resData.success === false) {
      const scriptErr = resData?.error || resText || 'Apps Script save failed';
      console.error('[Save Order API] Apps Script returned error:', scriptErr);
      return respond(500, {
        success: false,
        error: `Persistence gateway error: ${scriptErr}`
      });
    }

    return respond(200, {
      success: true,
      order_id: resData.order_id || resData.orderId || 'ORD000000'
    });

  } catch (err) {
    console.error('[Save Order API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
