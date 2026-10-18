// Cloudflare Worker: CORS proxy for the Phira API and file CDN.
// Usage: GET <worker-url>?url=<encoded Phira URL>

const ALLOWED_HOST = /(^|\.)5wyxi\.com$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': '*',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('Bad url', { status: 400, headers: CORS });
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOST.test(target.hostname)) {
      return new Response('Forbidden host', { status: 403, headers: CORS });
    }

    const upstream = await fetch(target, { method: 'GET', redirect: 'follow' });
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
