/* The share page a share link opens: /s/<id> is a script-free page whose og and twitter tags make platforms show the
   shared image as the preview, and /s/<id>.png is that image. Missing or expired ids go to the home page. */
const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escape = text => text.replace(/[&<>"']/g, c => ESCAPES[c]);
const home = origin => Response.redirect(`${origin}/`, 302);

/** GET /s/<id>: the page, with the title and description stored with the upload. */
export async function page(env, id, origin) {
  const object = await env.SHARES.head(id);
  if (!object) return home(origin);
  const {title = '', description = ''} = object.customMetadata ?? {};
  const [t, d] = [title || 'Discord Wrapped', description].map(escape);
  const url = `${origin}/s/${id}`, image = `${url}.png`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Discord Wrapped">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">
<style>
:root { color-scheme: light dark; --bg: #f7f7f9; --fg: #17181c; --accent: #4f5bd5; --accent-fg: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #111216; --fg: #ecedf1; --accent: #8790ff; --accent-fg: #0d0e14; } }
body { margin: 0; min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 20px; padding: 24px; box-sizing: border-box;
  background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
img { max-width: min(100%, 720px); max-height: 80vh; border-radius: 14px; }
a { background: var(--accent); color: var(--accent-fg); padding: 10px 18px; border-radius: 8px; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<img src="/s/${id}.png" alt="${t}">
<a href="/">See yours</a>
</body>
</html>
`;
  return new Response(html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300'}});
}

/** GET /s/<id>.png: the stored image. Ids never change content, so it caches for a year. */
export async function image(env, id, origin) {
  const object = await env.SHARES.get(id);
  if (!object) return home(origin);
  return new Response(object.body, {headers: {'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable'}});
}
