// Service worker do Hyper Studio: permite instalar o app e abrir sem internet.
// Estratégia "rede primeiro": sempre busca a versão nova; sem internet, usa a última cópia guardada.
const CACHE = "hyper-studio-v5";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())
));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  const sdkFirebase = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  const fontes = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!mesmoSite && !sdkFirebase && !fontes) return; // dados do Firestore e do Google: nunca passam por aqui
  if (mesmoSite && url.pathname.startsWith("/__/")) return; // rotas internas do Firebase Hosting
  e.respondWith(
    fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return resp;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
