/**
 * functions/api/send-email.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Handles order notification emails.
 * Placeholder implementation ready for transactional email integration.
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
    const payload = await request.json();

    if (!payload.email) {
      return respond(400, {
        success: false,
        error: 'Payload is missing required email field.'
      });
    }

    console.log(`[Email API] Forwarding email dispatch for order to Apps Script.`);

    // Call Google Apps Script Web App URL with action=sendEmail
    const response = await fetch(`${scriptUrl}?action=sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const resText = await response.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) {}

    if (!response.ok || resData.success === false) {
      const scriptErr = resData?.error || resText || 'Apps Script email dispatch failed';
      console.error('[Email API] Apps Script returned error:', scriptErr);
      return respond(500, {
        success: false,
        error: `Email gateway error: ${scriptErr}`
      });
    }

    return respond(200, {
      success: true
    });

  } catch (err) {
    console.error('[Email API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
