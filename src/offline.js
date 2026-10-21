/* ---------- offline and updates ---------- */
// Offline, the sponsor rails and footer grid hide (style.css) instead of showing invitations nobody can follow.
// ads.js also sets the class when the sponsor request can't reach the network, which navigator.onLine can miss.
const markOffline = () => document.documentElement.classList.toggle('offline', !navigator.onLine);
addEventListener('online', markOffline); addEventListener('offline', markOffline); markOffline();

// The service worker only runs on the site. A saved copy (file://) can't register one and keeps working from its one file.
if (/^https?:$/.test(location.protocol) && 'serviceWorker' in navigator) {
  const sw = navigator.serviceWorker;
  let asked = false;
  // Shown at the bottom and never forced: style.css hides it while a modal (the story player) is open.
  const updateReady = reg => {
    if (document.querySelector('.update-notice')) return;
    const box = Object.assign(document.createElement('div'), {className: 'update-notice', innerHTML: '<span>New version ready.</span> <button type="button" class="primary">Reload</button>'});
    box.setAttribute('role', 'status');
    box.querySelector('button').addEventListener('click', () => {
      // Reloading alone keeps the old worker while any tab uses it, so the waiting one is told to take over first.
      if (reg.waiting) { asked = true; reg.waiting.postMessage('activate'); } else location.reload();
    });
    document.body.append(box);
  };
  sw.register('/sw.js').then(reg => {
    const watch = w => w?.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) updateReady(reg); });
    if (reg.waiting && sw.controller) updateReady(reg);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // Long-open tabs look for a release when they come back to the front.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    // Another tab chose Reload: this one now runs on the new worker, so offer the same reload.
    sw.addEventListener('controllerchange', () => asked ? location.reload() : updateReady(reg));
  }).catch(() => { /* No worker: the site still works online. */ });
}
