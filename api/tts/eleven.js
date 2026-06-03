/**
 * POST /api/tts/eleven
 *
 * Server proxy for ElevenLabs TTS. Keeps the API key server-side. The clip is
 * streamed straight to the client (low TTFB) and, on a clean finish, cached in
 * R2 for 30 days keyed by sha256(voiceId + text + modelId + voice_settings).
 * Rate-limits per user: 1000 chars / hour tracked via Redis INCRBY.
 *
 * Body: {
 *   voiceId: string,
 *   text: string,
 *   modelId?: string,                        // default eleven_flash_v2_5
 *   voice_settings?: {                        // canonical ElevenLabs shape, honored verbatim
 *     stability?, similarity_boost?, style?,  // clamped to 0..1
 *     use_speaker_boost?                       // boolean
 *   }
 * }
 * Response: audio/mpeg (chunked)
 */

import { Redis } from '@upstash/redis';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { cors, method, wrap, error, readJson } from '../_lib/http.js';
import { sha256 } from '../_lib/crypto.js';
import { headObject, getObjectBuffer, putObject } from '../_lib/r2.js';
import {
	ELEVEN_BASE,
	DEFAULT_TTS_MODEL,
	elevenApiKey,
	normalizeVoiceSettings,
} from '../_lib/elevenlabs.js';

const CHARS_PER_HOUR = 1000;

// Fire-and-forget R2 cache write — a miss on failure is acceptable.
function cacheAudio(key, buffer) {
	if (!buffer.length) return;
	putObject({
		key,
		body: buffer,
		contentType: 'audio/mpeg',
		metadata: { 'created-at': new Date().toISOString() },
	}).catch((e) => console.warn('[tts/eleven] R2 cache write failed:', e.message));
}

// Only instantiate if Upstash is configured (mirrors the pattern in rate-limit.js).
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
	redis = new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL,
		token: process.env.UPSTASH_REDIS_REST_TOKEN,
	});
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const apiKey = elevenApiKey();
	if (!apiKey)
		return error(res, 503, 'not_configured', 'ElevenLabs is not configured on this server');

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in required');
	const userId = session?.id ?? bearer.userId;

	const body = await readJson(req);
	const voiceId = String(body.voiceId || '').trim();
	const text = String(body.text || '').trim();
	const modelId = String(body.modelId || DEFAULT_TTS_MODEL).trim();

	if (!voiceId) return error(res, 400, 'validation_error', 'voiceId is required');
	if (!text) return error(res, 400, 'validation_error', 'text is required');
	if (text.length > 500)
		return error(res, 400, 'validation_error', 'text exceeds 500 chars per request');

	// Honor the canonical ElevenLabs `voice_settings` object the client sends
	// (the ElevenLabsTTS client maps `rate` → `style` and forwards it here);
	// fall back to ElevenLabs' recommended defaults. Folded into the cache key so
	// distinct settings never collide on a shared clip.
	const settings = normalizeVoiceSettings(
		body.voice_settings && typeof body.voice_settings === 'object' ? body.voice_settings : {},
	);

	// ── Char-based rate limit ─────────────────────────────────────────────────
	// rKey is lifted to function scope so a failed synthesis can refund the
	// characters it optimistically reserves below.
	let rKey = null;
	if (redis) {
		const hourBucket = Math.floor(Date.now() / 3_600_000);
		rKey = `tts:chars:${userId}:${hourBucket}`;
		const used = Number((await redis.get(rKey)) || 0);
		if (used + text.length > CHARS_PER_HOUR) {
			return error(
				res,
				429,
				'rate_limited',
				`TTS character limit (${CHARS_PER_HOUR}/hr) reached. Try again next hour.`,
			);
		}
		// Increment before synthesis to prevent parallel races from blowing past limit.
		const newTotal = await redis.incrby(rKey, text.length);
		await redis.expire(rKey, 7200);
		if (newTotal > CHARS_PER_HOUR) {
			await redis.decrby(rKey, text.length).catch(() => {});
			return error(
				res,
				429,
				'rate_limited',
				`TTS character limit (${CHARS_PER_HOUR}/hr) reached. Try again next hour.`,
			);
		}
	}

	// Refund reserved characters when synthesis ultimately fails, so a user is
	// not billed against the hourly budget for a clip they never received.
	const refundChars = async () => {
		if (rKey) await redis.decrby(rKey, text.length).catch(() => {});
	};

	// ── R2 cache lookup ───────────────────────────────────────────────────────
	const cacheHash = await sha256(
		`${voiceId}\x00${text}\x00${modelId}\x00${settings.stability}\x00${settings.similarity_boost}\x00${settings.style}\x00${settings.use_speaker_boost}`,
	);
	const cacheKey = `tts/cache/${cacheHash}.mp3`;

	const cached = await headObject(cacheKey).catch(() => null);
	if (cached) {
		try {
			const buf = await getObjectBuffer(cacheKey);
			res.setHeader('content-type', 'audio/mpeg');
			res.setHeader('content-length', String(buf.length));
			res.setHeader('x-tts-cache', 'hit');
			res.setHeader('cache-control', 'private, max-age=86400');
			return res.end(buf);
		} catch {
			// Cache read failed — fall through to synthesize fresh.
		}
	}

	// ── Synthesize via ElevenLabs ─────────────────────────────────────────────
	let elResp;
	try {
		elResp = await fetch(
			`${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'audio/mpeg',
					'xi-api-key': apiKey,
				},
				body: JSON.stringify({
					text,
					model_id: modelId,
					voice_settings: settings,
				}),
			},
		);
	} catch (fetchErr) {
		console.error('[tts/eleven] ElevenLabs fetch failed', fetchErr);
		await refundChars();
		return error(res, 502, 'upstream_error', 'Could not reach ElevenLabs');
	}

	if (!elResp.ok) {
		const msg = await elResp.text().catch(() => '');
		console.error('[tts/eleven] ElevenLabs error', elResp.status, msg);
		await refundChars();
		return error(res, 502, 'upstream_error', `ElevenLabs returned ${elResp.status}`);
	}

	// Stream the clip to the client for low TTFB while teeing the chunks into a
	// buffer, so the complete audio can be cached once it has fully arrived.
	res.setHeader('content-type', 'audio/mpeg');
	res.setHeader('x-tts-cache', 'miss');
	res.setHeader('cache-control', 'private, max-age=86400');

	if (!elResp.body) {
		// No readable stream (unexpected) — fall back to a single buffered write.
		const audioBuffer = Buffer.from(await elResp.arrayBuffer());
		res.setHeader('content-length', String(audioBuffer.length));
		res.end(audioBuffer);
		cacheAudio(cacheKey, audioBuffer);
		return;
	}

	const chunks = [];
	let completed = false;
	try {
		for await (const chunk of elResp.body) {
			if (res.destroyed) break; // client hung up — stop pulling from upstream
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			chunks.push(buf);
			// Respect write backpressure so a slow client can't pile unbounded data
			// into the socket buffer. Resolve on 'close' too, so a mid-clip
			// disconnect can't hang this await forever.
			if (!res.write(buf)) {
				await new Promise((resolve) => {
					const done = () => {
						res.off('drain', done);
						res.off('close', done);
						resolve();
					};
					res.once('drain', done);
					res.once('close', done);
				});
			}
		}
		// Only a naturally-exhausted iterator (no break/destroy) means every
		// upstream byte arrived — required before we may cache the clip.
		completed = !res.destroyed;
	} catch (streamErr) {
		// Upstream aborted or the client disconnected mid-clip. Don't cache a
		// partial, possibly-corrupt file — just close the response.
		console.error('[tts/eleven] stream interrupted', streamErr);
		if (!res.writableEnded && !res.destroyed) res.end();
		return;
	}

	if (!res.writableEnded && !res.destroyed) res.end();
	// Cache only a complete clip — a truncated one would poison the deterministic
	// cache key and be served as a permanent "hit" for this utterance.
	if (completed) cacheAudio(cacheKey, Buffer.concat(chunks));
});
