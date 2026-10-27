// Bộ nhớ đệm để app mở được khi không có mạng (video và dữ liệu học nằm trong IndexedDB).
const CACHE = "hqp-v1";
const FILES = ["./", "index.html", "css/style.css", "js/app.js", "js/subtitles.js", "js/exercises.js", "js/embedded.js", "js/store.js",
  "js/services.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Mạng trước (luôn có bản mới), mất mạng thì dùng bản đã lưu.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
