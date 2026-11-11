/* Salco Lente: funcionamiento sin conexión.
   - Páginas, scripts y catálogo: primero la red, y si falla, la copia guardada (así los cambios se ven al publicar).
   - Librerías e imágenes propias: primero la copia guardada (cargan al instante).
   - Imágenes de otros sitios (p. ej. static.salcobrand.cl) no se tocan.
   Al publicar cambios grandes, sube el número de CACHE. */
const CACHE = 'salco-lente-v38';
const V = '?v=38';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css' + V, 'js/config.js' + V, 'js/ar.js' + V, 'js/frente.js' + V, 'js/app.js' + V, 'js/encuesta.js' + V, 'js/model3d.js' + V,
  'data/productos.json', 'lib/zxing.min.js', 'lib/qrcode.js', 'lib/three.min.js', 'img/sb-logo.png', 'img/mi-salcobrand.png', 'img/icon-192.png', 'img/productos/ref/centella.png', 'img/productos/ref/cluny.png', 'img/productos/ref/nivea.png', 'img/productos/ref/ferranem.png', 'img/productos/ref/oleo-petrizzio.png', 'img/productos/ref/sandtan.png', 'img/productos/ref/butterfly.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const estatico = u.pathname.includes('/lib/') || u.pathname.includes('/img/');
  if (estatico) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; })));
  } else {
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; }).catch(() => caches.match(r).then((hit) => hit || caches.match('index.html'))));
  }
});
