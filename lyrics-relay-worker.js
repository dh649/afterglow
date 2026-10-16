// Afterglow lyrics relay: a free Cloudflare Worker that forwards LRCLIB
// lookups so the browser is allowed to read them. Paste this whole file into
// a new Worker at dash.cloudflare.com, deploy, then paste the Worker's
// address into Afterglow > Settings > Lyrics relay.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    // Only LRCLIB's read-only lookups are forwarded.
    if (request.method !== "GET" || !/^\/api\/(get|search)$/.test(url.pathname)) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const upstream = await fetch("https://lrclib.net" + url.pathname + url.search, {
      headers: { "User-Agent": "Afterglow personal player (lyrics relay)" },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });
  },
};
