/* Service worker de Bote.
 *
 * La app tiene que funcionar en el salón de alguien sin cobertura, así que se
 * guarda entera en la instalación y a partir de ahí se sirve desde la caché.
 * En segundo plano se pide la versión de red: si hay una nueva, entra la
 * próxima vez que se abra.
 *
 * Al publicar una versión nueva hay que subir VERSION, o los móviles que ya la
 * tengan instalada seguirán con la vieja.
 */

const VERSION = 'bote-v2';

const ARCHIVOS = [
  './',
  'index.html',
  'css/app.css',
  'js/ui.js',
  'js/motor.js',
  'js/estado.js',
  'js/fichas.js',
  'manifest.webmanifest',
  'iconos/icono-32.png',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Uno a uno: si un archivo falla, no se cae la instalación entera.
    await Promise.all(ARCHIVOS.map((f) => cache.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardado = await cache.match(req, { ignoreSearch: true });

    const red = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // Lo guardado va primero: abre al instante y sin depender de la cobertura.
    if (guardado) return guardado;

    const res = await red;
    if (res) return res;
    // Sin caché y sin red: si se pedía una página, se devuelve la app.
    if (req.mode === 'navigate') {
      const inicio = await cache.match('index.html') || await cache.match('./');
      if (inicio) return inicio;
    }
    return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' });
  })());
});
