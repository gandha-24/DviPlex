/**
 * functions/api/save-feedback.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles feedback persistence.
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
    const feedbackPayload = await request.json();

    if (!feedbackPayload.order_id || feedbackPayload.rating === undefined) {
      return respond(400, {
        success: false,
        error: 'Payload is missing required order_id or rating fields.'
      });
    }

    console.log(`[Save Feedback API] Forwarding feedback for order "${feedbackPayload.order_id}" to Apps Script.`);

    // Call Google Apps Script Web App URL with action=saveFeedback
    const response = await fetch(`${scriptUrl}?action=saveFeedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackPayload),
      redirect: 'follow'
    });

    const resText = await response.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) {}

    if (!response.ok || resData.success === false) {
      const scriptErr = resData?.error || resText || 'Apps Script feedback save failed';
      console.error('[Save Feedback API] Apps Script returned error:', scriptErr);
      return respond(500, {
        success: false,
        error: `Persistence gateway error: ${scriptErr}`
      });
    }

    return respond(200, {
      success: true
    });

  } catch (err) {
    console.error('[Save Feedback API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
