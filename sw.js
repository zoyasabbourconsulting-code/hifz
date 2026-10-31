/* Offline support: keeps the app itself and its fonts on the device so it opens without internet.
   Pages: network first (so updates arrive), cache as fallback. Fonts: cache first.
   Adhkar audio is not handled here: the page saves it in IndexedDB and plays it from there. */
var APP = 'hifz-app-v3', FONTS = 'hifz-fonts-v1';
var SHELL = ['./', './index.html', './asr-worker.js', './tafsir-muyassar.json', './asbab-nuzul.json', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(APP).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== APP && k !== FONTS && k.indexOf('hifz-') === 0; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (r) {
    if (r.ok) { var cp = r.clone(); caches.open(APP).then(function (c) { c.put(req, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(req, {ignoreSearch: true}).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    });
  }));
});
