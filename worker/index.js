/* Serves the sponsor ads API; everything else is the static site in public/. */
import {ACTIVE_SQL, toAd} from './ads.js';

const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|avif)$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const json = (body, maxAge) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json', 'cache-control': `public, max-age=${maxAge}`}});
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function activeRows(env) {
  return (await env.DB.prepare(ACTIVE_SQL).bind(now()).all()).results;
}

export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    if (pathname === '/api/ads') {
      return json({ads: (await activeRows(env)).map(toAd).filter(Boolean)}, 300);
    }
    const image = pathname.match(/^\/api\/ads\/(\d+)\/image$/);
    if (image) {
      // Images are proxied so the page never loads anything from another site.
      const row = (await activeRows(env)).find(r => r.id === +image[1]);
      if (!row || !toAd(row)) return new Response('Not found', {status: 404});
      const upstream = await fetch(row.image_url, {cf: {cacheTtl: 86400, cacheEverything: true}});
      const type = (upstream.headers.get('content-type') || '').split(';')[0].trim();
      const size = +(upstream.headers.get('content-length') || 0);
      if (!upstream.ok || !IMAGE_TYPES.test(type) || size > MAX_IMAGE_BYTES) return new Response('Bad ad image', {status: 502});
      const body = await upstream.arrayBuffer();
      if (body.byteLength > MAX_IMAGE_BYTES) return new Response('Bad ad image', {status: 502});
      return new Response(body, {headers: {'content-type': type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'"}});
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', {status: 404});
    return env.ASSETS.fetch(request);
  },
};
