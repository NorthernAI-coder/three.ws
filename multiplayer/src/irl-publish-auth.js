// Verifier for the IRL pin publish webhook (POST /internal/irl-publish).
//
// Vercel can't hold a WebSocket, so when the three.ws API mutates a pin
// (POST/PATCH/DELETE /api/irl/pins) it fires this signed HTTP webhook at the
// standalone Colyseus host, which fans the change into the matching geocell room
// as a schema patch. The signature binds the request to the exact delivered body
// and a fresh timestamp, so a captured tuple can't be replayed with a different
// pin or after the freshness window.
//
// Keep byte-for-byte in sync with the API signer (api/_lib/irl-realtime.js):
//   signed = `irl:<geocell>:<type>:<ts>:<base64url(sha256(JSON(pin)))>`
//   sig    = base64url(HMAC_SHA256(secret, signed))
//   secret = MULTIPLAYER_SHARED_SECRET (→ HOLDER_PASS_SECRET → public dev secret),
//            the same fallback chain presence-token.js / persistence.js use.

import crypto from 'node:crypto';

function secret() {
	return (
		process.env.MULTIPLAYER_SHARED_SECRET ||
		process.env.HOLDER_PASS_SECRET ||
		'dev-insecure-multiplayer-secret'
	);
}

function timingSafeEqualStr(a, b) {
	const ab = Buffer.from(String(a || ''));
	const bb = Buffer.from(String(b || ''));
	if (ab.length !== bb.length) return false;
	return crypto.timingSafeEqual(ab, bb);
}

// Maximum age (seconds) an irl-publish signature stays valid. The API mints and
// delivers within a couple of round-trips, so a tight window bounds replay while
// clearing normal network + clock-skew jitter. Mirrors NOTIFY_MAX_AGE_S.
const PUBLISH_MAX_AGE_S = 120;

export function verifyIrlPublish(geocell, type, pin, ts, sig) {
	if (typeof sig !== 'string' || !sig) return false;
	if (typeof geocell !== 'string' || typeof type !== 'string') return false;
	const tsNum = Number(ts);
	if (!Number.isFinite(tsNum)) return false;
	const nowS = Math.floor(Date.now() / 1000);
	if (Math.abs(nowS - tsNum) > PUBLISH_MAX_AGE_S) return false;
	const pinHash = crypto
		.createHash('sha256')
		.update(JSON.stringify(pin ?? {}))
		.digest('base64url');
	const expected = crypto
		.createHmac('sha256', secret())
		.update(`irl:${geocell}:${type}:${tsNum}:${pinHash}`)
		.digest('base64url');
	return timingSafeEqualStr(sig, expected);
}
