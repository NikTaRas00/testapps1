const CACHE = 'clock-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './cities.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('notificationclose', () => {});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'schedule-alarm') {
    const { alarm, fireAtMs } = data;
    if (!('showTrigger' in Notification.prototype)) return;
    if (typeof TimestampTrigger === 'undefined') return;
    if (!alarm || !fireAtMs || fireAtMs <= Date.now()) return;
    event.waitUntil(
      self.registration.showNotification(alarm.label || 'Alarm', {
        tag: `alarm-${alarm.id}`,
        body: new Date(fireAtMs).toLocaleTimeString(),
        showTrigger: new TimestampTrigger(fireAtMs),
        requireInteraction: true,
        silent: false,
        data: { alarmId: alarm.id, fireAtMs },
      }).catch(() => {})
    );
  } else if (data.type === 'cancel-alarm') {
    event.waitUntil(
      self.registration.getNotifications({ tag: `alarm-${data.alarmId}`, includeTriggered: true })
        .then((notes) => notes.forEach((n) => n.close()))
        .catch(() => {})
    );
  }
});
