const VERSION = 'v2-' + '2026-08-21';            // bump on deploys that change the shell
const SHELL = ['./', 'index.html', 'coach.html', 'site.css', 'config.js', 'schedule_lib.js', 'store.js', 'ui.js', 'coach_sheets.js', 'api.js',
  'home_page.js', 'coach_page.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;                 // data is cached by the app, not the SW
  const cacheable = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (!cacheable) return;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: url.origin === location.origin }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
