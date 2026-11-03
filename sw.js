/* RaceLab F1 — service worker: sempre tenta a versão mais nova na rede; sem internet, usa a cópia salva */
const V = 'racelab-v45';
const SHELL = ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'css/app.css', 'js/core.js', 'js/charts.js', 'js/data.js', 'js/pages1.js', 'js/pages2.js', 'js/telemetry.js', 'js/strategy.js', 'js/circuits.js', 'js/live.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {
    if (u.pathname.startsWith('/api/')) return; // dados ao vivo: sempre rede
    // rede primeiro (revalidando), cópia salva só se a rede falhar ou demorar demais
    e.respondWith(caches.open(V).then(async (c) => {
      const fresh = fetch(r, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(r, res.clone()); return res; });
      fresh.catch(() => {});
      const saved = () => c.match(r, { ignoreSearch: true }).then((h) => h || (r.mode === 'navigate' ? c.match('index.html') : undefined));
      try { return await Promise.race([fresh, new Promise((_, no) => setTimeout(no, 5000))]); }
      catch { return (await saved()) || fresh.catch(() => Response.error()); }
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) { // fontes: cache-first
    e.respondWith(caches.open(V).then(async (c) => (await c.match(r)) || fetch(r).then((res) => { c.put(r, res.clone()); return res; })));
  }
});
