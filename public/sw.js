'use strict';
const CACHE = 'global-tycoon-v15-bots';
const CORE = [
  './',
  './index.html',
  './style.css',
  './client.js',
  './rules-catalog.js',
  './contextual-rules.js',
  './contextual-rules.js?v=20261011-bots-v1',
  './rules-catalog.js?v=20261011-bots-v1',
  './style.css?v=20261011-bots-v1',
  './client.js?v=20261011-bots-v1',
  './socket.io/socket.io.js',
  './assets/board-world-map-v1.webp',
  './assets/atlas-background-v1.webp',
  './manifest.webmanifest',
  './icon.svg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(CORE.filter(url => !url.endsWith('.webp')));
    await Promise.allSettled(CORE.filter(url => url.endsWith('.webp')).map(url => c.add(url)));
  }).then(() => self.skipWaiting()));
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
  const strictCore = /\/(?:client\.js|style\.css|rules-catalog\.js|contextual-rules\.js)$/.test(url.pathname) || url.pathname === '/socket.io/socket.io.js';
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
      if(res.ok)caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => strictCore ? new Response('', {status:503}) : caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || new Response('', { status: 503 }))))
  );
});

