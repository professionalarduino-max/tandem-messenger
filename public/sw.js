/* Service worker Tandem: оболочка из кеша, данные — всегда из сети. */

const VERSION = 'tandem-v5'
const SHELL = `${VERSION}-shell`

// Приложение может лежать не в корне домена (GitHub Pages — /tandem-messenger/),
// поэтому все пути считаем от области видимости самого service worker.
const BASE = new URL('./', self.registration.scope).pathname
const path = (file) => BASE + file

const SHELL_FILES = [
  BASE,
  path('offline.html'),
  path('manifest.webmanifest'),
  path('icon-192.png'),
  path('icon-512.png'),
  path('apple-touch-icon.png'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

/** Переходы по страницам: сеть, при обрыве — кеш, иначе офлайн-заглушка. */
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request)
    const cache = await caches.open(SHELL)
    cache.put(BASE, fresh.clone())
    return fresh
  } catch {
    return (
      (await caches.match(BASE)) || (await caches.match(path('offline.html'))) || Response.error()
    )
  }
}

/** Статика сборки (assets/...) неизменяема — кеш, потом сеть. */
async function handleAsset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const fresh = await fetch(request)
  if (fresh.ok) {
    const cache = await caches.open(SHELL)
    cache.put(request, fresh.clone())
  }
  return fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Ничего не трогаем у Supabase: сообщения, файлы и realtime должны идти напрямую.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (url.pathname.startsWith(path('assets/')) || SHELL_FILES.includes(url.pathname)) {
    event.respondWith(handleAsset(request))
  }
})

/** Клик по уведомлению — открыть уже запущенное окно, иначе новое. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '.', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
