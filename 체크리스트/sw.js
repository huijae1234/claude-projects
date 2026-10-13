// sw.js — 한 번 열어 본 뒤에는 인터넷이 없어도 화면이 열리게 파일을 저장해 둔다.
const CACHE = 'izzyma-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'storage.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크를 먼저 시도하고, 안 되면 저장해 둔 파일을 쓴다(수정한 코드가 바로 반영되도록).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request)));
});
