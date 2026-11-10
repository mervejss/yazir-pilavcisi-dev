/* Yazır Pilavcısı — hafif service worker.
   Yalnızca "yüklenebilir uygulama" ve çevrimdışı bilgi sayfası içindir; JS/API önbelleklemez (eski sürüm sorunu çıkarmaz). */
const CACHE = 'yz-offline-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});
