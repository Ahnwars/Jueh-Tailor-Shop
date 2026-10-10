/**
 * Jueh Tailoring API proxy for Cloudflare Workers.
 * Worker variables: SCRIPT_URL (Apps Script /exec URL),
 * ALLOWED_ORIGIN=https://ahnwars.github.io
 */
export default {
  async fetch(request, env) {
    const allowedOrigin = String(env.ALLOWED_ORIGIN || "https://ahnwars.github.io").trim();
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const respond = (body, status) => new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });

    if (!origin || origin !== allowedOrigin) return respond({ status: "error", message: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return respond({ status: "error", message: "POST required." }, 405);

    const scriptUrl = String(env.SCRIPT_URL || "").trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(scriptUrl)) {
      return respond({ status: "error", message: "Worker SCRIPT_URL is not configured correctly." }, 500);
    }
    const type = (request.headers.get("Content-Type") || "").toLowerCase();
    if (!type.startsWith("text/plain") && !type.startsWith("application/json")) {
      return respond({ status: "error", message: "Unsupported content type." }, 415);
    }

    let body;
    try {
      if (Number(request.headers.get("Content-Length") || 0) > 65536) throw new Error("too large");
      body = await request.text();
      if (body.length > 65536) throw new Error("too large");
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.action !== "string") throw new Error("invalid");
    } catch (error) {
      return respond({ status: "error", message: "Invalid request body." }, 400);
    }

    try {
      const upstream = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body,
        redirect: "follow"
      });
      const raw = await upstream.text();
      let result;
      try { result = JSON.parse(raw); }
      catch (error) { return respond({ status: "error", message: "Backend returned an invalid response." }, 502); }
      return respond(result, upstream.ok ? 200 : 502);
    } catch (error) {
      return respond({ status: "error", message: "Backend unavailable." }, 502);
    }
  }
};
