/* Share links: uploads a share image to the site (POST /api/share) and returns its /s/<id> link, which platforms
   unfurl into that image. Each image version uploads once; each upload's delete key is kept in this browser. Pure apart
   from the origin, fetch, storage and locks it's given, so the tests can import it. */
const SHARE_KEYS = 'du-shares';

/**
 * shareLinks({origin}).link(blob, {title, description}) resolves to the image's share link, or null when the upload fails
 * (offline, rate-limited, refused); callers then use the plain site link. The same Blob resolves to the same link,
 * and a failed upload is tried again on the next call. Uploads are recorded as [{id, deleteKey}] under SHARE_KEYS.
 * It rejects only when an upload's key couldn't be recorded and the upload couldn't be deleted again either, so this
 * browser can no longer delete it.
 */
export function shareLinks({origin = globalThis.location?.origin, fetch = globalThis.fetch, storage = globalThis.localStorage, locks = globalThis.navigator?.locks} = {}) {
  let made = new WeakMap();
  const saved = () => JSON.parse(storage.getItem(SHARE_KEYS) || '[]');
  // Every read-modify-write of SHARE_KEYS holds this lock, so tabs uploading and deleting at once keep each other's keys.
  const update = async change => {
    const write = async () => storage.setItem(SHARE_KEYS, JSON.stringify(change(saved())));
    return locks ? locks.request(SHARE_KEYS, write) : write();
  };
  const remove = s => fetch(`/api/share/${s.id}`, {method: 'DELETE', headers: {'x-delete-key': s.deleteKey}}).then(r => r.ok, () => false);
  async function upload(blob, {title = '', description = ''}) {
    const res = await fetch(`/api/share?${new URLSearchParams({title, description})}`, {method: 'POST', body: blob, headers: {'content-type': 'image/png'}}).catch(() => null);
    if (!res?.ok) return null;
    const share = await res.json();
    try {
      await update(list => [...list, share]);
    } catch {
      // An upload whose key isn't recorded could never be deleted from here, so it's deleted straight away instead.
      if (await remove(share)) return null;
      throw new Error("Couldn't save this image's delete key, so it can't be deleted from this browser. It's removed automatically after 90 days.");
    }
    return `${origin}/s/${share.id}`;
  }
  return {
    link(blob, meta = {}) {
      if (!made.has(blob)) made.set(blob, upload(blob, meta).then(url => url ?? (made.delete(blob), null), e => { made.delete(blob); throw e; }));
      return made.get(blob);
    },
    /** How many uploads from this browser are still recorded. */
    count: () => saved().length,
    /** Deletes every recorded upload; resolves to how many couldn't be deleted, which stay recorded for a retry. */
    async deleteAll() {
      const list = saved(), gone = new Set();
      for (const s of list) if (await remove(s)) gone.add(s.id);
      // Images shared again after this upload a fresh copy, rather than reusing a deleted link.
      made = new WeakMap();
      await update(current => current.filter(s => !gone.has(s.id)));
      return list.length - gone.size;
    },
  };
}
