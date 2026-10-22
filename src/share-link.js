/* Share links: uploads a share image to the site (POST /api/share) and returns its /s/<id> link, which platforms
   unfurl into that image. Each image version uploads once; each upload's delete key is kept in this browser. Pure apart
   from the fetch and storage it's given, so the tests can import it. */
const SHARE_KEYS = 'du-shares';

/**
 * shareLinks({origin}).link(blob, {title, description}) resolves to the image's share link, or null when the upload fails
 * (offline, rate-limited, refused); callers then use the plain site link. The same Blob resolves to the same link,
 * and a failed upload is tried again on the next call. Uploads are recorded as [{id, deleteKey}] under SHARE_KEYS.
 */
export function shareLinks({origin = globalThis.location?.origin, fetch = globalThis.fetch, storage = globalThis.localStorage} = {}) {
  const made = new WeakMap();
  const saved = () => JSON.parse(storage.getItem(SHARE_KEYS) || '[]');
  async function upload(blob, {title = '', description = ''}) {
    try {
      const res = await fetch(`/api/share?${new URLSearchParams({title, description})}`, {method: 'POST', body: blob, headers: {'content-type': 'image/png'}});
      if (!res.ok) return null;
      const {id, deleteKey} = await res.json();
      storage.setItem(SHARE_KEYS, JSON.stringify([...saved(), {id, deleteKey}]));
      return `${origin}/s/${id}`;
    } catch { return null; }
  }
  return {
    link(blob, meta = {}) {
      if (!made.has(blob)) made.set(blob, upload(blob, meta).then(url => url ?? (made.delete(blob), null)));
      return made.get(blob);
    },
  };
}
