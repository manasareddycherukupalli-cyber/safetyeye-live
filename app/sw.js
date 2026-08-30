// sw.js — makes the app survive the network dying, which it will.
//
// Everything static is served from the cache. Once installed, the app opens in
// aeroplane mode with no network at all.

const CACHE = 'safetyeye-v3';

const SHELL = [
  './',
  './index.html',
  './app.js',
  './vision.js',
  './rules.js',
  './report.js',
  './log.js',
  './mesh.js',
  './supervisor.html',
  './supervisor.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './vendor/tf.min.js',
  './vendor/coco-ssd.min.js',
  './vendor/coco-ssd/model.json',
  './vendor/coco-ssd/group1-shard1of5',
  './vendor/coco-ssd/group1-shard2of5',
  './vendor/coco-ssd/group1-shard3of5',
  './vendor/coco-ssd/group1-shard4of5',
  './vendor/coco-ssd/group1-shard5of5'
];

// addAll fails the whole install if any single URL 404s, and app/index.html does
// not exist yet. Cache what resolves, skip what doesn't, log the gaps.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const missing = [];
    await Promise.all(SHELL.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
        else missing.push(`${url} (${res.status})`);
      } catch (e) {
        missing.push(`${url} (${e.message})`);
      }
    }));
    if (missing.length) console.warn('[sw] not cached:', missing);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return; // straight to the network, untouched
  }

  // Network-first, cache as fallback.
  //
  // The "network" here is the static server on 127.0.0.1 — same device, always fast,
  // so going to it first costs nothing and guarantees a `git pull` is actually visible
  // on the next reload. Cache-first cost us an afternoon of debugging stale code.
  //
  // The cache is still fully populated, so aeroplane mode works exactly as before:
  // when the fetch fails, we serve what we stored.
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.ok) (await caches.open(CACHE)).put(event.request, res.clone());
      return res;
    } catch (e) {
      const hit = await caches.match(event.request);
      if (hit) return hit;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
