const VERSION='kintai-v8-8-2-audit-20260926';
const CACHE=`${VERSION}-app`;
const SHELL=['./index.html?v=8.8.2','./style.css?v=8.8.2','./app.js?v=8.8.2','./quick-check.js?v=8.8.2','./law-guide.js?v=8.8.2','./manifest.webmanifest','./icon-192.png','./icon-512.png','./localgovjp.json','./gps-check.html','./gps-check.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys()){if((k.startsWith('kintai-')||k.startsWith('truck-kintai-'))&&k!==CACHE)await caches.delete(k)}await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url),home=new URL('./',self.location.href);
  if(req.method!=='GET'||u.origin!==home.origin||!u.pathname.startsWith(home.pathname))return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Keep HTML and versioned scripts in one installed release, including offline.
    const key=(u.pathname===home.pathname||u.pathname===home.pathname+'index.html')?'./index.html?v=8.8.2':req;
    const hit=await cache.match(key);if(hit)return hit;
    try{return await fetch(req)}catch{return Response.error()}
  })());
});
