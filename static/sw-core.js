/* MaxPDF service worker. VERSION and PRECACHE are prepended by the server (/sw.js). */
const SHELL = '/index.html';
const RUNTIME = 'maxpdf-rt-' + VERSION;
const PRE = 'maxpdf-pre-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(PRE);
    // addAll fails entirely on one 404; add individually so one bad file can't block install
    await Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('maxpdf-') && k !== PRE && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function networkFirst(req, fallbackUrl) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') (await caches.open(RUNTIME)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || (fallbackUrl && (await caches.match(fallbackUrl))) || Response.error();
  }
}
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;          // never cache jobs/downloads
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL)); return; }
  if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/img/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));                        // js/css: fresh when online, cached when offline
});
