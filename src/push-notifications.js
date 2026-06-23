// Web Push — client controller.
//
// Subscribes the browser to push via the already-registered VitePWA service
// worker, registers the subscription with the backend, and drives the
// re-engagement funnel's `returned` signal. Deliberately does NOT prompt on
// load — `enablePush()` is only ever called from a value moment (the inbox
// "turn on push" banner, or the preference center toggle).
//
// Public API:
//   isPushSupported()        → boolean (SW + PushManager + Notification)
//   getPushConfig()          → { pushEnabled, vapidPublicKey }
//   getPushState()           → { supported, permission, subscribed }
//   enablePush()             → subscribe + register; returns final state
//   disablePush()            → unsubscribe + deregister
//   trackReturnedFromPush()  → record `returned` when booted from a push click

let _configPromise = null;

export function isPushSupported() {
	return (
		typeof navigator !== 'undefined' &&
		'serviceWorker' in navigator &&
		typeof window !== 'undefined' &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export async function getPushConfig() {
	if (!_configPromise) {
		_configPromise = fetch('/api/config', { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((c) => ({
				pushEnabled: Boolean(c?.pushEnabled),
				vapidPublicKey: c?.vapidPublicKey || '',
			}))
			.catch(() => ({ pushEnabled: false, vapidPublicKey: '' }));
	}
	return _configPromise;
}

export async function getPushState() {
	if (!isPushSupported()) {
		return { supported: false, permission: 'unsupported', subscribed: false };
	}
	const permission = Notification.permission;
	let subscribed = false;
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		const sub = await reg?.pushManager?.getSubscription();
		subscribed = Boolean(sub);
	} catch {
		/* registration not ready yet */
	}
	return { supported: true, permission, subscribed };
}

// Subscribe + register. Returns { ok, reason?, state }. `reason` is one of
// 'unsupported' | 'unconfigured' | 'denied' | 'error' on failure.
export async function enablePush() {
	if (!isPushSupported()) return { ok: false, reason: 'unsupported', state: await getPushState() };

	const { pushEnabled, vapidPublicKey } = await getPushConfig();
	if (!pushEnabled || !vapidPublicKey) {
		return { ok: false, reason: 'unconfigured', state: await getPushState() };
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed', state: await getPushState() };
	}

	try {
		const reg = await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
			});
		}
		await registerSubscription(sub);
		return { ok: true, state: await getPushState() };
	} catch (err) {
		console.error('[push] subscribe failed', err);
		return { ok: false, reason: 'error', state: await getPushState() };
	}
}

export async function disablePush() {
	if (!isPushSupported()) return { ok: true };
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		const sub = await reg?.pushManager?.getSubscription();
		if (sub) {
			await deregisterSubscription(sub.endpoint);
			await sub.unsubscribe();
		}
		return { ok: true };
	} catch (err) {
		console.error('[push] unsubscribe failed', err);
		return { ok: false };
	}
}

// When the page boots from a push click (the SW appends ?source=push&n=<id>),
// record the `returned` funnel event and strip the params so a reload/share of
// the URL doesn't double-count or leak the notification id.
export async function trackReturnedFromPush() {
	try {
		const params = new URLSearchParams(location.search);
		if (params.get('source') !== 'push') return;
		const n = params.get('n');
		await fetch('/api/notifications/track', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				notification_id: n || undefined,
				channel: 'push',
				event: 'returned',
			}),
		}).catch(() => {});

		params.delete('source');
		params.delete('n');
		const qs = params.toString();
		const clean = location.pathname + (qs ? `?${qs}` : '') + location.hash;
		history.replaceState(null, '', clean);
	} catch {
		/* non-fatal */
	}
}

// ── backend register/deregister ──────────────────────────────────────────────

async function registerSubscription(sub) {
	const csrf = await getCsrf();
	const r = await fetch('/api/push/subscribe', {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
		body: JSON.stringify({ subscription: sub.toJSON() }),
	});
	if (!r.ok && r.status !== 201) throw new Error(`register failed: ${r.status}`);
}

async function deregisterSubscription(endpoint) {
	const csrf = await getCsrf();
	await fetch('/api/push/subscribe', {
		method: 'DELETE',
		credentials: 'include',
		headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
		body: JSON.stringify({ endpoint }),
	}).catch(() => {});
}

// Single-use CSRF token (server burns it on first use; never cache).
async function getCsrf() {
	try {
		const r = await fetch('/api/csrf-token', { credentials: 'include' });
		if (!r.ok) return null;
		const j = await r.json().catch(() => null);
		return j?.data?.token || null;
	} catch {
		return null;
	}
}

// VAPID keys arrive base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

// Auto-record a push-sourced return as soon as the module loads.
if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', trackReturnedFromPush, { once: true });
	} else {
		trackReturnedFromPush();
	}
}
