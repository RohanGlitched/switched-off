// Keeps the app shell and the map on the phone, so the report form opens with no signal.
// Arkiv requests always go to the network; reports made offline wait in the page's queue.
const SHELL = 'switched-off-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/report', '/geo/india-dots.json', '/manifest.webmanifest', '/favicon.svg'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // pages: network first, fall back to the cached shell; assets: cache first
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return r }).catch(() => caches.match('/')))
    return
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/geo/'))) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)) }
    return r
  })))
})
