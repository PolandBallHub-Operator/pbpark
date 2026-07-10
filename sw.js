---
# this ensures Jekyll processes the file
---
const CACHE_NAME = 'polandballhub-cache-v2';
const STATIC_CACHE = 'polandballhub-static-v2';

const urlsToCache = [
  '{{ site.baseurl }}/',
  '{{ site.baseurl }}/index.html',
  '{{ site.baseurl }}/applist/',
  '{{ site.baseurl }}/applist/index.html',
  '{{ site.baseurl }}/manifest.json'
];

// インストール時にキャッシュを作成
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        console.log('Opened dynamic cache');
        return cache.addAll(urlsToCache).catch(err => {
          console.log('Cache addAll error:', err);
        });
      }),
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Opened static cache');
      })
    ]).then(() => {
      self.skipWaiting();
    })
  );
});

// フェッチイベント処理
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // GETリクエストのみ処理
  if (request.method !== 'GET') {
    return;
  }

  // 外部リソース（CDN、API）はネットワーク優先
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // ローカルリソースはキャッシュ優先
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
          return response;
        });
      })
      .catch(() => {
        // オフライン時のフォールバック
        return new Response('オフラインです。インターネット接続を確認してください。', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain; charset=utf-8'
          })
        });
      })
  );
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, STATIC_CACHE];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.claim();
    })
  );
});
