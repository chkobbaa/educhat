self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "EduChat", body: event.data.text() };
  }

  const title = payload.title || "EduChat";
  const options = {
    body: payload.body || "New message",
    tag: payload.tag || "chat-message",
    data: payload.data || {},
    badge: "/favicon.ico",
    icon: "/favicon.ico",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
        return;
      }

      self.clients.openWindow("/");
    }),
  );
});
