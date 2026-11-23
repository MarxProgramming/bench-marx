// Install the whole release before it becomes eligible to serve offline.
const root = self.registration.scope;
const release = '2.0';
const prefix = 'bench-marx:' + root + ':';
const cacheName = prefix + release;
const entry = new URL('index.html', root).href;
const files = ['index.html','style.css','model.js','art.js','ui.js','gymnastics.js','analysis.js','motion.js','actions.js','manifest.webmanifest','touch-icon.png','icon-192.png','icon-512.png'];
const canonical = new Map(files.map(f => {
  const url=new URL(f,root).href;
  return [url,f==='index.html'?entry:url+'?v='+release];
}));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache=await caches.open(cacheName);
    await cache.addAll([...canonical.values()].map(url=>new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith(prefix)&&n!==cacheName).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const version=url.searchParams.get('v');
  url.search='';url.hash='';
  const asset=canonical.get(url.href===root?entry:url.href);
  if(!asset || (version && version!==release))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    return (await cache.match(asset)) || fetch(event.request);
  })());
});
