/**
 * netlify/functions/save-order.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Netlify serverless function — receives a complete order object from the
 * DviPlex order page, then forwards it to the Google Apps Script Web App which
 * writes the row into Google Sheets.
 *
 * Why a proxy function instead of calling Apps Script directly from the browser?
 *   • Apps Script Web App URLs don't support proper CORS, so browser fetch calls
 *     with mode:'cors' fail or return opaque responses with mode:'no-cors'.
 *   • Routing through this function gives us a real JSON response, lets us add
 *     auth headers or rate-limiting later, and keeps the Apps Script URL
 *     server-side only.
 *
 * ── Environment variable (Netlify dashboard → Site settings → Env vars) ──
 *   APPS_SCRIPT_URL   Full Google Apps Script Web App exec URL
 *                     (falls back to the hardcoded URL below if not set)
 *
 * ── Request (POST  application/json) ──
 *   Full order payload object (see order.html for shape)
 *
 * ── Success response (200) ──
 *   Exactly what Apps Script returned: { "success": true, "order_id": "ORD000001" }
 *
 * ── Failure response (4xx / 5xx) ──
 *   { "success": false, "error": "human-readable message" }
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURATION
───────────────────────────────────────────────────────────────────────────── */

/**
 * Google Apps Script Web App URL.
 * Prefer the env var so you can rotate the URL without a redeployment.
 * Falls back to the literal URL when the env var is not set.
 */
const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxL3d_F3IRYbdpGf-CtCp9DV9Rh3fO40THukdp_s5AKn7r-BwAkHXWt2--YPaASbxNJPg/exec';

/** How long to wait for Apps Script before timing out (milliseconds). */
const APPS_SCRIPT_TIMEOUT_MS = 15_000; // 15 s

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Shared JSON response factory with CORS headers.
 * Every response — success or error — goes through here.
 *
 * @param {number} statusCode  HTTP status code
 * @param {object} body        Object to serialise as JSON
 * @returns {object}           Netlify function response
 */
function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',              // restrict to your domain in production
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Wrap fetch with an AbortController-based timeout.
 * Rejects with an Error whose message mentions the timeout duration.
 *
 * @param {string}  url
 * @param {object}  options   fetch init options (minus signal — we add that)
 * @param {number}  timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Apps Script did not respond within ${timeoutMs / 1000} seconds. Please try again.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────────────────────────── */

exports.handler = async (event) => {
  /* ── CORS preflight ── */
  if (event.httpMethod === 'OPTIONS') {
    return respond(204, {});
  }

  /* ── Only accept POST ── */
  if (event.httpMethod !== 'POST') {
    return respond(405, {
      success: false,
      error:   'Method not allowed. Use POST.',
    });
  }

  /* ── Parse request body ── */
  if (!event.body) {
    return respond(400, {
      success: false,
      error:   'Request body is empty.',
    });
  }

  let orderPayload;
  try {
    orderPayload = JSON.parse(event.body);
  } catch (_) {
    return respond(400, {
      success: false,
      error:   'Invalid JSON in request body.',
    });
  }

  /* ── Basic sanity check — must at least have an orderId ── */
  if (!orderPayload.orderId) {
    return respond(422, {
      success: false,
      error:   'Payload is missing the required "orderId" field.',
    });
  }

  console.log(
    `[save-order] Forwarding order "${orderPayload.orderId}" to Apps Script.`
  );

  /* ── Forward to Google Apps Script ── */
  let appsScriptResponse;
  try {
    appsScriptResponse = await fetchWithTimeout(
      APPS_SCRIPT_URL,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(orderPayload),
        // Apps Script returns a redirect (302) to itself after a POST;
        // 'follow' (the default) handles this transparently.
        redirect: 'follow',
      },
      APPS_SCRIPT_TIMEOUT_MS
    );
  } catch (networkErr) {
    console.error('[save-order] Network error reaching Apps Script:', networkErr.message);
    return respond(502, {
      success: false,
      error:   `Could not reach the order processing server: ${networkErr.message}`,
    });
  }

  /* ── Read Apps Script response body ── */
  let appsScriptData;
  try {
    appsScriptData = await appsScriptResponse.json();
  } catch (_) {
    // Apps Script occasionally returns HTML on misconfiguration
    const rawText = await appsScriptResponse.text().catch(() => '(unreadable)');
    console.error(
      `[save-order] Apps Script returned non-JSON (HTTP ${appsScriptResponse.status}):`,
      rawText.slice(0, 300)
    );
    return respond(502, {
      success: false,
      error:   'Order processing server returned an unexpected response. Please try again.',
    });
  }

  /* ── Apps Script signalled a failure in the JSON body ── */
  if (appsScriptData.success === false) {
    console.error(
      `[save-order] Apps Script reported failure for order "${orderPayload.orderId}":`,
      appsScriptData.error
    );
    return respond(500, {
      success: false,
      error:   appsScriptData.error || 'Order could not be saved. Please try again.',
    });
  }

  /* ── Success ── */
  console.log(
    `[save-order] ✅ Order "${appsScriptData.order_id || orderPayload.orderId}" saved to sheet.`
  );

  // Return exactly what Apps Script returned so the browser can display the
  // canonical order_id (generated server-side) on the success page.
  return respond(200, appsScriptData);
};
