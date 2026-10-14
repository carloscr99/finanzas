// Service worker de Mis Finanzas: cachea la "carcasa" de la app para que, instalada en el móvil, abra al instante
// y también sin conexión. Los datos (Firestore), el login (Google) y las cotizaciones (prices.json) nunca pasan por aquí.
//
// Sube la versión de CACHE cada vez que cambie la lista PRECACHE (por ejemplo al actualizar Chart.js o Firebase).
const CACHE = "finanzas-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js"
];
const CACHE_FIRST_HOSTS = ["cdnjs.cloudflare.com", "www.gstatic.com"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // Cada recurso se añade por separado: si uno falla (p. ej. sin red) no se cancela la instalación entera.
      .then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isShellFile = sameOrigin && /\/(index\.html|firebase-config\.js|manifest\.webmanifest|icon-192\.png|icon-512\.png)$/.test(url.pathname);
  const isNavigation = req.mode === "navigate";
  const isCdn = CACHE_FIRST_HOSTS.includes(url.hostname) && /firebasejs\/|chart\.umd/.test(url.pathname);

  // Página e índice: red primero (así llegan las actualizaciones), caché si no hay conexión.
  if (isNavigation || (isShellFile && /index\.html$|firebase-config\.js$/.test(url.pathname))) {
    event.respondWith(
      fetch(req)
        .then(res => { if (res.ok) putInCache(req, res.clone()); return res; })
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }
  // Iconos, manifest y librerías de CDN (versiones fijadas): caché primero.
  if (isShellFile || isCdn) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) putInCache(req, res.clone()); return res; }))
    );
    return;
  }
  // Todo lo demás (Firestore, autenticación de Google, prices.json, fuentes) va directo a la red.
});

function putInCache(req, res) {
  return caches.open(CACHE).then(cache => cache.put(req, res)).catch(() => null);
}
