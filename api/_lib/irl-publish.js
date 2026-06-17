// IRL realtime publish transport — the Vercel→Colyseus webhook for D1 live pin
// sync. This is the single place that actually talks to the multiplayer host;
// callers (api/irl/pins.js lifecycle, api/_lib/irl-realtime.js reskin hook) hand
// it a typed pin change and never block on the result.
//
// Vercel functions can't hold a WebSocket, so when a pin is placed / moved /
// re-skinned / removed we fire a signed HTTP webhook at the standalone Colyseus
// host, which fans the change into the matching geocell room as a schema delta
// every viewer there receives within the patch interval. Best-effort by design:
// the pin is already persisted in Neon and every viewer's poll fallback / next
// room load reconciles it, so a publish failure degrades to "slightly slower",
// never to data loss. Never awaited on a request's critical path.
//
// Keep byte-for-byte in sync with the verifier (multiplayer/src/irl-publish-auth.js):
//   signed = `irl:<geocell>:<type>:<ts>:<base64url(sha256(JSON(pin)))>`
//   sig    = base64url(HMAC_SHA256(MULTIPLAYER_SHARED_SECRET, signed))

import { env } from './env.js';
import { hmacSha256, sha256Base64Url } from './crypto.js';

const PUBLISH_TYPES = new Set(['pin:add', 'pin:update', 'pin:remove']);

/**
 * Publish a pin change to the multiplayer host. Returns a small result object;
 * callers fire-and-forget (`void publishIrlPin(...)`) and never block on it.
 * @param {'pin:add'|'pin:update'|'pin:remove'} type
 * @param {string} geocell precision-6 cell the pin lives in
 * @param {object} pin wire object — full ({ id, lat, lng, heading, avatarUrl, … })
 *                      for add, a partial subset for update, or just { id } for remove
 */
export async function publishIrlPin(type, geocell, pin = {}) {
	if (!PUBLISH_TYPES.has(type)) return { delivered: false, reason: 'bad_type' };
	if (typeof geocell !== 'string' || !geocell) return { delivered: false, reason: 'no_geocell' };
	const base = env.MULTIPLAYER_INTERNAL_URL;
	if (!base) return { delivered: false, reason: 'unconfigured' };
	try {
		const ts = Math.floor(Date.now() / 1000);
		const pinHash = await sha256Base64Url(JSON.stringify(pin ?? {}));
		const sig = await hmacSha256(
			env.MULTIPLAYER_SHARED_SECRET,
			`irl:${geocell}:${type}:${ts}:${pinHash}`,
		);
		const res = await fetch(`${base}/internal/irl-publish`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-mp-signature': sig,
				'x-mp-timestamp': String(ts),
			},
			body: JSON.stringify({ geocell, type, pin }),
			signal: AbortSignal.timeout(2500),
		});
		if (!res.ok) return { delivered: false, reason: `http_${res.status}` };
		const body = await res.json().catch(() => ({}));
		const count = Number(body?.delivered) || 0;
		return { delivered: count > 0, count };
	} catch (err) {
		return { delivered: false, reason: err?.name === 'TimeoutError' ? 'timeout' : 'error' };
	}
}
