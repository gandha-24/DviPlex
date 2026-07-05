/**
 * functions/api/get-feedbacks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Pages Function — Retrieves feedbacks list.
 * Forwards the request as a POST to the Google Apps Script Web App URL.
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
  const { env } = context;
  const scriptUrl = env.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    return respond(500, {
      success: false,
      error: 'GOOGLE_SCRIPT_URL environment variable is not configured on the server.'
    });
  }

  try {
    console.log(`[Get Feedbacks API] Fetching feedbacks from Apps Script via POST.`);

    // Call Google Apps Script Web App URL with action=getFeedbacks
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getFeedbacks' }),
      redirect: 'follow'
    });

    const resText = await response.text();
    let resData = {};
    try {
      resData = JSON.parse(resText);
    } catch (_) {}

    if (!response.ok || resData.success === false) {
      const scriptErr = resData?.error || resText || 'Apps Script feedback retrieval failed';
      console.error('[Get Feedbacks API] Apps Script returned error:', scriptErr);
      return respond(500, {
        success: false,
        error: `Persistence gateway error: ${scriptErr}`
      });
    }

    return respond(200, resData);

  } catch (err) {
    console.error('[Get Feedbacks API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
