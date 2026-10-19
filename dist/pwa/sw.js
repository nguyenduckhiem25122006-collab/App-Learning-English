/* Offline cache: app shell cache-first, Google Fonts stale-while-revalidate. */
const CACHE = "nhip-659a8e6b62";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "img/beasts/cat.webp", "img/beasts/dog.webp", "img/beasts/dragon.webp", "img/beasts/goat.webp", "img/beasts/horse.webp", "img/beasts/monkey.webp", "img/beasts/ox.webp", "img/beasts/pig.webp", "img/beasts/rat.webp", "img/beasts/rooster.webp", "img/beasts/snake.webp", "img/beasts/tiger.webp"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
