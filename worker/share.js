/* Share links: the page uploads the (redacted) share image it made, and posts link to /s/<id> so platforms show that
   image as the preview. Images live in R2 under a random id; an R2 lifecycle rule deletes them after 90 days. */
const MAX_BYTES = 2 * 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 10;
const META_LIMIT = {title: 200, description: 300};
export const SHARE_ID = /^[0-9A-Za-z]{10}$/;

// Random base62, rejecting bytes past the last whole multiple of 62 so every character is equally likely.
function randomId(length = ID_LENGTH) {
  let id = '';
  while (id.length < length) for (const b of crypto.getRandomValues(new Uint8Array(length))) if (b < 248 && id.length < length) id += B62[b % 62];
  return id;
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const json = (body, status = 200) => Response.json(body, {status, headers: {'cache-control': 'no-store'}});

/**
 * POST /api/share?title=&description= with a PNG body (at most 2 MB): stores it and answers 201
 * {id, url, deleteKey}, or 429 past the SHARE_UPLOADS limit for the visitor's IP. The delete key is only ever
 * returned here; R2 keeps its SHA-256.
 */
export async function upload(request, env, origin) {
  const {success} = await env.SHARE_UPLOADS.limit({key: request.headers.get('cf-connecting-ip') || 'unknown'});
  if (!success) return json({error: 'too many uploads'}, 429);
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return json({error: 'too large'}, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return json({error: 'too large'}, 413);
  if (!PNG.every((b, i) => body[i] === b)) return json({error: 'PNG only'}, 415);
  const params = new URL(request.url).searchParams;
  const meta = Object.fromEntries(Object.entries(META_LIMIT).map(([k, n]) => [k, (params.get(k) || '').slice(0, n)]));
  const id = randomId(), deleteKey = randomId(32);
  await env.SHARES.put(id, body, {
    httpMetadata: {contentType: 'image/png'},
    customMetadata: {...meta, deleteHash: await sha256(deleteKey)},
  });
  return json({id, url: `${origin}/s/${id}`, deleteKey}, 201);
}

/** DELETE /api/share/<id> with the upload's key in `x-delete-key`: 204 when gone, 403 for a wrong key. */
export async function remove(request, env, id) {
  const object = await env.SHARES.head(id);
  if (!object) return new Response(null, {status: 204});
  if (await sha256(request.headers.get('x-delete-key') || '') !== object.customMetadata?.deleteHash) return json({error: 'wrong key'}, 403);
  await env.SHARES.delete(id);
  return new Response(null, {status: 204});
}
