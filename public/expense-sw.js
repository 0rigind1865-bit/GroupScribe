// 報帳頁的離線快取（Snaptab public/sw.js 搬來，範圍限定 /a/expense）
// - 頁面（HTML）：網路優先；沒網路才拿上次存的，讓員工在收訊差的地方也打得開「記一筆」
// - 程式與樣式（/_next/static）：先用快取、背景更新
// - API 一律不攔：記帳送不出去時由頁面自己的離線暫存（outbox）處理
const CACHE = 'gs-expense-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gs-expense-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  const save = (res) => {
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  };

  if (req.mode === 'navigate' || req.headers.get('RSC')) {
    event.respondWith(
      fetch(req)
        .then(save)
        .catch(() => caches.match(req).then((hit) => hit || caches.match(req, { ignoreSearch: true }))),
    );
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then(save).catch(() => hit);
        return hit || net;
      }),
    );
  }
});
