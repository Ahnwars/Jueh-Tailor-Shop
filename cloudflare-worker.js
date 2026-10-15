/**
 * Cloudflare Worker proxy for the Jueh Tailoring Google Apps Script backend.
 *
 * Deploy this file as a Worker, then paste its HTTPS URL into API_PROXY_URL
 * in js/common.js. Restrict CORS to the published GitHub Pages site.
 */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxCI7z5Q4ouI3XZhbcV2V5nKGIYe0QlGiMQnoRLzF804Zm6xoxc4QjdXFZs2IlJY0aS/exec";
const ALLOWED_ORIGINS = new Set([
  "https://ahnwars.github.io"
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://ahnwars.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ status: "error", message: "POST required." }), {
        status: 405,
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
      });
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ status: "error", message: "Origin not allowed." }), {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
      });
    }

    try {
      const contentType = request.headers.get("Content-Type") || "";
      let body;
      if (contentType.includes("application/json")) {
        const data = await request.json();
        body = new URLSearchParams();
        for (const [key, value] of Object.entries(data || {})) {
          if (value !== undefined && value !== null) {
            body.set(key, typeof value === "string" ? value : String(value));
          }
        }
      } else {
        // Also supports the hidden-iframe upload form.
        body = new URLSearchParams(await request.text());
      }

      const action = body.get("action") || "";
      if (!action || action === "getSiteStatus") {
        return new Response(JSON.stringify({ status: "error", message: "Invalid POST action." }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
        });
      }

      const upstream = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
        redirect: "follow"
      });
      const responseText = await upstream.text();
      // GAS ContentService may redirect; fetch follows it and returns the final body.
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (_) {
        return new Response(JSON.stringify({
          status: "error",
          message: "The Apps Script backend returned an unexpected response. Check its deployment and execution logs."
        }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
        });
      }
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        status: "error",
        message: "The backend proxy could not complete the request. Check the Worker and Apps Script deployment."
      }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};
