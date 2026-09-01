// ============================================================================
// SERVICE WORKER — hace la app instalable y la deja funcionar sin internet.
//
// Estrategia: "RED PRIMERO" para los archivos propios.
//   · Con internet: siempre se sirve la versión más nueva del servidor y se
//     guarda una copia. Cambiás un archivo, redesplegás, recargás y aparece.
//     YA NO hace falta subir la VERSION cada vez que cambiás un logo o el JS.
//   · Sin internet: se sirve la última copia guardada.
//
// La VERSION solo sirve para limpiar cachés viejos al instalar una app nueva.
// Conviene subirla igual cuando hay cambios grandes, pero ya no es obligatorio
// para que se vean las actualizaciones.
// ============================================================================

const VERSION = 'censo-v15';

// Lo mínimo para que la app abra sin internet la primera vez.
// Las imágenes de partido NO van acá a propósito: cambian seguido y no
// queremos que queden congeladas.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './tailwind.css',
  './dashboard.css',
  './js/configData.js',
  './js/supabaseClient.js',
  './js/app.js',
  './js/dashboard.js',
  './img/logo-censogt.png',
  './img/partidos/neutral.svg',
  './img/icon-192.png',
  './img/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (cache) => {
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

  // Nunca interceptar escrituras ni llamadas a Supabase / CDNs externas.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // RED PRIMERO para todo lo propio (navegación, JS, CSS e imágenes):
  // se intenta el servidor; si responde, se guarda copia y se entrega.
  // Si no hay internet, se cae al caché; y si es navegación, al index.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copia));
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((enCache) =>
          enCache || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
