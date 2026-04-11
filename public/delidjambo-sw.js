const CACHE_NAME = 'delidjambo-v1'
const OFFLINE_URL = '/driver'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Network-first pour toutes les requêtes API/Supabase
  if (event.request.url.includes('/rest/') || event.request.url.includes('/api/')) {
    return
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
