/* Serves the static site and forwards sponsor requests to the shared sponsor service over a service binding,
   so the page only ever talks to its own origin. */
const SPONSOR_PATHS = /^\/api\/(ads(\/\d+\/image)?|availability|footer(\/[^/]+\/logo)?)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (SPONSOR_PATHS.test(url.pathname) && request.method === 'GET') {
      const upstream = new URL(url.pathname, 'https://sponsors.internal');
      for (const key of ['x', 'v']) if (url.searchParams.has(key)) upstream.searchParams.set(key, url.searchParams.get(key));
      upstream.searchParams.set('site', env.SPONSOR_SITE);
      return env.SPONSORS.fetch(upstream, {headers: {accept: request.headers.get('accept') ?? '*/*'}});
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', {status: 404});
    return env.ASSETS.fetch(request);
  },
};
