'use strict';
const CACHE = 'global-tycoon-v8-mobile';
const CORE = [
  './',
  './index.html',
  './style.css',
  './client.js',
  './rules-catalog.js',
  './rules-catalog.js?v=20261009-mobile-r2',
  './style.css?v=20261009-mobile-r2',
  './client.js?v=20261009-mobile-r2',
  './socket.io/socket.io.js',
  './assets/world-map-ocean.png',
  './assets/ocean-surface.png',
  './manifest.webmanifest',
  './icon.svg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 联机握手和轮询不作为静态资源缓存；离线只提供页面外壳。
  if (url.pathname.startsWith('/socket.io/') && url.pathname !== '/socket.io/socket.io.js') return;
  const isNav = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');
  if (isNav) {
    // HTML/导航：网络优先，失败回退缓存，保证更新即时生效
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }
  // 静态资源：缓存优先 + 网络回退并写入缓存（资源 URL 带版本号，版本更新即换 URL）
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || new Response('', { status: 503 }))))
  );
});
