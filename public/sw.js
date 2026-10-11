// Keeps the app shell, its scripts and the map on the phone, so the report form opens with no signal.
// Arkiv requests always go to the network; reports made offline wait in the page's queue.
const SHELL = 'switched-off-shell-v3'
const ROUTES = ['/', '/report', '/register', '/drill', '/file', '/why', '/data']
const isPage = (p) => ROUTES.includes(p) || p.startsWith('/e/')
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(SHELL)
      // the shell, and every hashed script and stylesheet the shell names (a first visit then works offline)
      const html = await fetch('/', { cache: 'no-store' })
      if (html.ok) {
        const t = await html.clone().text()
        await c.put('/', html)
        const assets = [...t.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
        await Promise.all([...new Set([...assets, '/geo/india-dots.json', '/manifest.webmanifest', '/favicon.svg'])].map((u) => c.add(u).catch(() => {})))
      }
      await self.skipWaiting()
    })(),
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // pages: network first, fall back to the cached shell (only the app's own routes, only good answers)
  if (e.request.mode === 'navigate') {
    if (!isPage(url.pathname)) return
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok && r.headers.get('content-type')?.includes('text/html')) caches.open(SHELL).then((c) => c.put('/', r.clone()))
          return r
        })
        .catch(() => caches.match('/')),
    )
    return
  }
  // assets: cache first, and keep new hashed assets as they arrive
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/geo/'))) caches.open(SHELL).then((c) => c.put(e.request, r.clone()))
          return r
        }),
    ),
  )
})
