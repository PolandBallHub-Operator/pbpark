---
# this ensures Jekyll processes the file
---
const CACHE_NAME = 'polandballhub-cache-v5';
const STATIC_CACHE = 'polandballhub-static-v3';

const urlsToCache = [
  '{{ site.baseurl }}/',
  '{{ site.baseurl }}/index.html',
  '{{ site.baseurl }}/applist/',
  '{{ site.baseurl }}/applist/index.html',
  '{{ site.baseurl }}/parklauncher/',
  '{{ site.baseurl }}/parklauncher/index.html',
  '{{ site.baseurl }}/manifest.json'
];

// 各アプリが個別のtheme-colorを持たなくても、PWAのシステムバーを
// ライト=白／ダーク=黒に統一するための共通設定。
const PWA_THEME_SCRIPT = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000"><meta name="apple-mobile-web-app-status-bar-style" content="default"><script>(function(){function sync(){var dark=document.documentElement.classList.contains('dark-mode')||(document.body&&document.body.classList.contains('dark-mode'));var metas=document.querySelectorAll('meta[name="theme-color"]');metas.forEach(function(m){m.setAttribute('content',dark?'#000000':'#FFFFFF')});document.documentElement.style.colorScheme=dark?'dark':'light';var apple=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(apple)apple.setAttribute('content',dark?'black':'default')}sync();document.addEventListener('DOMContentLoaded',function(){sync();if(document.body)new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']})});new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});})();</script>`;

async function injectPwaTheme(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const withoutThemeTags = html.replace(/\s*<meta\s+[^>]*name=["']theme-color["'][^>]*>\s*/gi, '');
  const themedHtml = withoutThemeTags.replace(/<\/head>/i, `${PWA_THEME_SCRIPT}</head>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(themedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, STATIC_CACHE];

  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => !cacheWhitelist.includes(cacheName))
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Keep third-party resources network-first, with a cached fallback.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML navigation stays fresh but remains available offline.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => injectPwaTheme(response))
        .then(response => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets use cache-first for fast repeat visits.
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then(response => {
        if (response && response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
        }
        return response;
      });
    })
  );
});
