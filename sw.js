/* RaceLab F1 — service worker: app shell offline; dados sempre da rede (com cache próprio no app) */
const V = 'racelab-v39';
const SHELL = ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'css/app.css', 'js/core.js', 'js/charts.js', 'js/data.js', 'js/pages1.js', 'js/pages2.js', 'js/telemetry.js', 'js/strategy.js', 'js/circuits.js', 'js/live.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) { // stale-while-revalidate para arquivos do app
    e.respondWith(caches.open(V).then(async (c) => { const hit = await c.match(r, { ignoreSearch: true }); const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit || (r.mode === 'navigate' ? c.match('index.html') : Response.error())); return hit || net; }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) { // fontes: cache-first
    e.respondWith(caches.open(V).then(async (c) => (await c.match(r)) || fetch(r).then((res) => { c.put(r, res.clone()); return res; })));
  }
});
