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

  const apiKey = env.EMAIL_API_KEY;
  const emailFrom = env.EMAIL_FROM;

  try {
    const payload = await request.json();

    console.log(`[Email API] Placeholder processing email send to: ${payload.email}`);
    
    if (!apiKey || !emailFrom) {
      console.warn('[Email API] EMAIL_API_KEY or EMAIL_FROM missing. Working in dry-run mode.');
    }

    // Always succeed for placeholder execution
    return respond(200, {
      success: true,
      message: 'Email confirmation skipped (placeholder service active).'
    });

  } catch (err) {
    console.error('[Email API] Error:', err);
    return respond(500, {
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
}
