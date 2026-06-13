---
---
var CACHE_NAME = 'pbhub-v1';
var urlsToCache = [
  '{{ site.baseurl }}/',
  '{{ site.baseurl }}/index.html',
  '{{ site.baseurl }}/manifest.json',
  '{{ site.baseurl }}/images/icon-192.png',
  '{{ site.baseurl }}/images/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response ? response : fetch(event.request);
    })
  );
});

self.addEventListener('activate', function(event) {
  var cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
