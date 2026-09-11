const CACHE = "pve-control-v1";
const SHELL = ["/", "/style.css", "/app.js", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca cachear chamadas de API — sempre precisam de dado atual (status do container).
  if (url.pathname.startsWith("/api")) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: "Offline" }), { status: 503 })));
    return;
  }

  // App shell: cache-first, com atualização em background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
