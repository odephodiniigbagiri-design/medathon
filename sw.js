/* TTE service worker.
   Purpose: lets the classroom be installed as an app, and shows a friendly page when the phone is offline.
   Pages and scripts always come from the network first (so a new deploy shows up straight away) and fall back
   to the saved copy if the network is slow or gone. Videos, the database, file downloads and everything
   else on other sites are never touched. You normally never need to edit this file. */
const V = 'tte-v1';
const CORE = ['./', 'classroom.html', 'index.html', 'config.js', 'liveboard.js', 'docview.js', 'manifest.webmanifest',
  'tte-icon-192.png', 'tte-icon-512.png', 'tte-icon-maskable-512.png', 'tte-apple-touch-icon.png'];
const CDN = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TTE is offline</title>' +
  '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#071a45;color:#fff;font:18px/1.6 system-ui,sans-serif;text-align:center;padding:1.5rem">' +
  '<div><h1 style="font-size:1.5rem;margin:0 0 .5rem">You are offline</h1><p style="opacity:.85;margin:0 0 1.2rem">Connect to the internet to open your TTE classroom.</p>' +
  '<button onclick="location.reload()" style="font:inherit;font-weight:700;background:#f6b400;border:0;border-radius:8px;padding:.6rem 1.2rem;cursor:pointer">Try again</button></div>';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function keep(req, res) {
  const c = await caches.open(V), u = new URL(req.url);
  const old = await c.keys();
  await Promise.all(old.filter(k => { const x = new URL(k.url); return x.origin === u.origin && x.pathname === u.pathname && k.url !== req.url; }).map(k => c.delete(k)));
  await c.put(req, res);
}

function netFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(async () => { const hit = await caches.match(req, { ignoreSearch: true }); if (hit) finish(hit); }, 4000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic') keep(req, res.clone()).catch(() => {});
      finish(res);
    }).catch(async () => {
      clearTimeout(timer);
      const hit = await caches.match(req, { ignoreSearch: true });
      finish(hit || (req.mode === 'navigate' ? new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : Response.error()));
    });
  });
}

async function swr(req) {
  const c = await caches.open(V), hit = await c.match(req.url);
  const net = fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' })).then(res => { if (res.ok) c.put(req.url, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  return (await net) || fetch(req).catch(() => Response.error());
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return;
    e.respondWith(netFirst(r));
  } else if (CDN.test(u.hostname)) {
    e.respondWith(swr(r));
  }
});
