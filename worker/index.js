/* Serves the static site, stores share images for share links (share.js) and renders their pages (page.js), and
   forwards sponsor requests to the shared sponsor service over a service binding, so the page only ever talks to its own origin. */
import {image, page} from './page.js';
import {SHARE_ID, remove, upload} from './share.js';

const SPONSOR_PATHS = /^\/api\/(ads(\/\d+\/image)?|availability|footer(\/[A-Za-z0-9_-]+\/logo)?)$/;
const SHARE_ITEM = /^\/api\/share\/([^/]+)$/;
const SHARE_PAGE = /^\/s\/([^/]*?)(\.png)?$/;
// public/_headers covers static files; these cover what the Worker answers itself, unless a response sets its own.
const HEADERS = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
};

async function route(request, env) {
  const url = new URL(request.url);
  if (SPONSOR_PATHS.test(url.pathname) && request.method === 'GET') {
    const upstream = new URL(url.pathname, 'https://sponsors.internal');
    for (const key of ['x', 'v']) if (url.searchParams.has(key)) upstream.searchParams.set(key, url.searchParams.get(key));
    upstream.searchParams.set('site', env.SPONSOR_SITE);
    return env.SPONSORS.fetch(upstream, {headers: {accept: request.headers.get('accept') ?? '*/*'}});
  }
  if (url.pathname === '/api/share' && request.method === 'POST') return upload(request, env, url.origin);
  const item = url.pathname.match(SHARE_ITEM);
  if (item && SHARE_ID.test(item[1]) && request.method === 'DELETE') return remove(request, env, item[1]);
  if (url.pathname.startsWith('/s/')) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {allow: 'GET, HEAD'}});
    const [, id, png] = url.pathname.match(SHARE_PAGE) ?? [];
    if (!SHARE_ID.test(id ?? '')) return Response.redirect(`${url.origin}/`, 302);
    return (png ? image : page)(env, id, url.origin);
  }
  if (url.pathname.startsWith('/api/')) return new Response('Not found', {status: 404});
  return null;
}

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    if (!res) return env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [name, value] of Object.entries(HEADERS)) if (!out.headers.has(name)) out.headers.set(name, value);
    return out;
  },
};
