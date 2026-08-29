const VERSION='8.1.0-20260829-1';
const CACHE=`truck-kintai-${VERSION}`;
const BASE_URL=new URL('./',self.location.href);
const INDEX_URL=new URL('./index.html',BASE_URL);
const toUrl=path=>new URL(path,BASE_URL).href;
const SHELL=['./','./index.html','./style.css?v=8.1.0','./app.js?v=8.1.0','./manifest.webmanifest','./icon-192.png','./icon-512.png'].map(toUrl);

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()){
      if((key.startsWith('kintai-')||key.startsWith('truck-kintai-'))&&key!==CACHE)await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function navigate(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    const url=new URL(request.url);
    if(response.ok&&(url.pathname===BASE_URL.pathname||url.pathname===INDEX_URL.pathname))await cache.put(INDEX_URL.href,response.clone());
    return response;
  }catch{
    return (await cache.match(INDEX_URL.href))||(await cache.match(BASE_URL.href))||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==BASE_URL.origin||!url.pathname.startsWith(BASE_URL.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith(navigate(request));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request);
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone());
      return response;
    }catch{
      return Response.error();
    }
  })());
});
