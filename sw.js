const VERSION='kintai-v8-6-0-gps-strict-20260912-1';
const CACHE=`${VERSION}-app`;
const SHELL=['./','./index.html','./style.css?v=8.6.0','./app.js?v=8.6.0','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys()){if((k.startsWith('kintai-')||k.startsWith('truck-kintai-'))&&k!==CACHE)await caches.delete(k)}await self.clients.claim()})())});
async function nav(req){try{const r=await fetch(req,{cache:'no-store'});const c=await caches.open(CACHE);c.put('./index.html',r.clone());return r}catch(e){const c=await caches.open(CACHE);return (await c.match('./index.html'))||Response.error()}}
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;if(r.mode==='navigate'){e.respondWith(nav(r));return}const u=new URL(r.url);if(u.origin!==self.location.origin)return;e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(r);if(hit)return hit;try{const net=await fetch(r);if(net.ok)c.put(r,net.clone());return net}catch(err){return Response.error()}})())});
