// Biryani Badshah Admin Service Worker for Web Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// --- PUSH NOTIFICATION RECEIVER ---
self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 New Order Received!',
    body: 'A new order has been placed on Biryani Badshah.',
    icon: '/images/cart.png',
    badge: '/images/cart.png',
    tag: 'admin-new-order',
    data: { url: '/admin/orders' }
  }

  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data.body = event.data.text()
    }
  }

  const title = data.title || '🔔 New Order Received!'
  const options = {
    body: data.body || 'A new order has been verified.',
    icon: data.icon || '/images/cart.png',
    badge: data.badge || '/images/cart.png',
    tag: data.tag || `new-order-${Date.now()}`,
    renotify: data.renotify !== undefined ? data.renotify : true,
    requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : true,
    vibrate: [300, 100, 300, 100, 400],
    data: data.data || { url: '/admin/orders' },
    actions: [
      { action: 'view_order', title: '📦 View Order Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// --- NOTIFICATION CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/admin/orders'

  // Focus existing admin window/tab if available, otherwise open a new window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes('/admin') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
