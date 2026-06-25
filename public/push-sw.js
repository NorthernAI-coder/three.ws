//
// Web Push handlers, imported into the VitePWA-generated service worker via
// `workbox.importScripts: ['/push-sw.js']` (see vite.config.js). Kept as a plain
// classic worker script (no imports) so importScripts can pull it in.
//
// Responsibilities:
//   • push           — render the OS notification from the JSON payload
//                      api/_lib/notify-prefs.js#pushPayloadFor produced.
//   • notificationclick — focus or open the target URL (tagged ?source=push so
//                      the app records a `returned` funnel event), and beacon a
//                      `opened` event so sent→opened→returned is measurable.

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		// Some push services deliver a bare string; degrade gracefully.
		data = { title: 'three.ws', body: event.data ? event.data.text() : '' };
	}

	const title = data.title || 'three.ws';
	const options = {
		body: data.body || '',
		tag: data.tag || undefined,
		// Coalesce repeats of the same type into one notification line.
		renotify: Boolean(data.tag),
		icon: '/pwa-192x192.png',
		badge: '/pwa-192x192.png',
		data: {
			url: data.url || '/dashboard/',
			notificationId: data.notificationId || null,
			category: data.category || null,
		},
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const d = event.notification.data || {};
	const rawUrl = typeof d.url === 'string' && d.url ? d.url : '/dashboard/';

	event.waitUntil((async () => {
		// Record the open before navigating so the beacon isn't cut off.
		await trackOpen(d.notificationId);

		// Same-origin internal links open/focus an existing tab and carry the
		// push attribution params; external links (e.g. solscan) open directly.
		const isInternal = rawUrl.startsWith('/');
		const target = isInternal ? withPushParams(rawUrl, d.notificationId) : rawUrl;

		if (isInternal) {
			const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
			const origin = self.location.origin;
			for (const c of all) {
				if (c.url.startsWith(origin) && 'focus' in c) {
					await c.focus();
					if ('navigate' in c) { try { await c.navigate(target); } catch { /* cross-doc nav blocked */ } }
					return;
				}
			}
		}
		if (clients.openWindow) await clients.openWindow(target);
	})());
});

function withPushParams(path, notificationId) {
	const sep = path.includes('?') ? '&' : '?';
	let out = `${path}${sep}source=push`;
	if (notificationId) out += `&n=${encodeURIComponent(notificationId)}`;
	return out;
}

// Fire-and-forget funnel beacon. credentials:'include' carries the session
// cookie so the server can attribute the open; a logged-out click is a no-op.
async function trackOpen(notificationId) {
	try {
		await fetch('/api/notifications/track', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				notification_id: notificationId || undefined,
				channel: 'push',
				event: 'opened',
			}),
		});
	} catch {
		/* offline / blocked — the open still proceeds */
	}
}
