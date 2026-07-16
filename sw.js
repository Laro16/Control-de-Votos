// ============================================================================
// SERVICE WORKER básico — hace la app instalable y cachea el "shell".
// ⚠️ Al desplegar cambios, sube el número de VERSION para que los teléfonos
// descarguen la app nueva (si no, seguirán viendo la versión cacheada).
// ============================================================================

const VERSION = 'censo-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tailwind.css',
  './js/configData.js',
  './js/supabaseClient.js',
  './js/app.js',
  './js/dashboard.js',
  './img/logo.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/partidos/p1.png',
  './img/partidos/p2.png',
  './img/partidos/p3.png',
  './img/partidos/p4.png',
  './img/partidos/p5.png',
  './img/partidos/p6.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      // Se cachea archivo por archivo: si falta uno, no se rompe la instalación
      await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Nunca interceptar escrituras ni llamadas a Supabase / CDNs:
  // los datos siempre van directo a la red.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero (para recibir actualizaciones), caché de respaldo
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Archivos estáticos propios: caché primero, red de respaldo (y se guarda copia)
  e.respondWith(
    caches.match(req).then((enCache) => {
      if (enCache) return enCache;
      return fetch(req).then((resp) => {
        const copia = resp.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copia));
        return resp;
      });
    })
  );
});
