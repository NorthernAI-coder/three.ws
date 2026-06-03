// Unit tests for the shared ElevenLabs client (api/_lib/elevenlabs.js).
// fetch and the @elevenlabs/elevenlabs-js SDK are mocked so these run with no
// network and no API key — they pin the contract the TTS proxy + agent-voice
// endpoints depend on (cache behavior, error→status mapping, best-effort delete).

import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';

// SDK mock — hoisted so vi.mock's factory can reference it.
const { ivcCreate } = vi.hoisted(() => ({ ivcCreate: vi.fn() }));
vi.mock('@elevenlabs/elevenlabs-js', () => ({
	// Plain function (constructable) that returns the client shape; an arrow or
	// vi.fn impl can't be used with `new`.
	ElevenLabsClient: function ElevenLabsClient() {
		return { voices: { ivc: { create: ivcCreate } } };
	},
}));

import {
	DEFAULT_TTS_MODEL,
	TTS_MODELS,
	isValidModel,
	normalizeVoiceSettings,
	elevenApiKey,
	isConfigured,
	listVoices,
	invalidateVoiceCache,
	createClonedVoice,
	deleteVoice,
} from '../api/_lib/elevenlabs.js';

const realFetch = global.fetch;
afterAll(() => {
	global.fetch = realFetch;
});

function voicesResponse(voices) {
	return { ok: true, status: 200, json: async () => ({ voices }) };
}

beforeEach(() => {
	process.env.ELEVENLABS_API_KEY = 'sk_test_key';
	global.fetch = vi.fn();
	ivcCreate.mockReset();
	invalidateVoiceCache();
	vi.useRealTimers();
});

describe('config gate', () => {
	it('reflects ELEVENLABS_API_KEY presence', () => {
		expect(isConfigured()).toBe(true);
		expect(elevenApiKey()).toBe('sk_test_key');
		delete process.env.ELEVENLABS_API_KEY;
		expect(isConfigured()).toBe(false);
		expect(elevenApiKey()).toBeNull();
	});

	it('defaults to the low-latency flash model', () => {
		expect(DEFAULT_TTS_MODEL).toBe('eleven_flash_v2_5');
	});
});

describe('isValidModel / TTS_MODELS', () => {
	it('accepts catalog models and rejects everything else', () => {
		expect(isValidModel('eleven_flash_v2_5')).toBe(true);
		expect(isValidModel('eleven_turbo_v2_5')).toBe(true);
		expect(isValidModel('gpt-4o-tts')).toBe(false);
		expect(isValidModel(null)).toBe(false);
		expect(isValidModel(undefined)).toBe(false);
	});

	it('exposes the default model in the catalog', () => {
		expect(TTS_MODELS.some((m) => m.id === DEFAULT_TTS_MODEL)).toBe(true);
		for (const m of TTS_MODELS) expect(m).toMatchObject({ id: expect.any(String), label: expect.any(String) });
	});
});

describe('normalizeVoiceSettings', () => {
	it('returns null for null input (use defaults)', () => {
		expect(normalizeVoiceSettings(null)).toBeNull();
		expect(normalizeVoiceSettings(undefined)).toBeNull();
	});

	it('fills recommended defaults for an empty object', () => {
		expect(normalizeVoiceSettings({})).toEqual({
			stability: 0.5,
			similarity_boost: 0.75,
			style: 0.5,
			use_speaker_boost: true,
		});
	});

	it('clamps numeric fields to 0..1 and falls back on non-numbers', () => {
		expect(normalizeVoiceSettings({ stability: 2, similarity_boost: -1, style: 'nope' })).toEqual({
			stability: 1,
			similarity_boost: 0,
			style: 0.5,
			use_speaker_boost: true,
		});
	});

	it('coerces use_speaker_boost to a boolean', () => {
		expect(normalizeVoiceSettings({ use_speaker_boost: false }).use_speaker_boost).toBe(false);
		expect(normalizeVoiceSettings({ use_speaker_boost: 0 }).use_speaker_boost).toBe(false);
	});

	it('rejects non-object input with a 400', () => {
		expect(() => normalizeVoiceSettings('x')).toThrowError(/must be an object/);
		expect(() => normalizeVoiceSettings([])).toThrow();
		try {
			normalizeVoiceSettings(5);
		} catch (e) {
			expect(e.status).toBe(400);
		}
	});
});

describe('listVoices', () => {
	it('throws a 503 when unconfigured, without hitting the network', async () => {
		delete process.env.ELEVENLABS_API_KEY;
		await expect(listVoices()).rejects.toMatchObject({ status: 503 });
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('maps the upstream payload to safe public fields', async () => {
		global.fetch.mockResolvedValue(
			voicesResponse([
				{
					voice_id: 'v1',
					name: 'Rachel',
					category: 'premade',
					labels: { accent: 'american' },
					preview_url: 'https://x/preview.mp3',
					secret_internal_field: 'should-not-leak',
				},
			]),
		);
		const { voices, cached } = await listVoices();
		expect(cached).toBe(false);
		expect(voices).toEqual([
			{
				voice_id: 'v1',
				name: 'Rachel',
				category: 'premade',
				labels: { accent: 'american' },
				preview_url: 'https://x/preview.mp3',
			},
		]);
		expect(voices[0]).not.toHaveProperty('secret_internal_field');
	});

	it('serves a warm cache hit without refetching', async () => {
		global.fetch.mockResolvedValue(voicesResponse([{ voice_id: 'v1', name: 'A' }]));
		await listVoices();
		const second = await listVoices();
		expect(second.cached).toBe(true);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('refetches after the cache is invalidated', async () => {
		global.fetch.mockResolvedValue(voicesResponse([{ voice_id: 'v1', name: 'A' }]));
		await listVoices();
		invalidateVoiceCache();
		await listVoices();
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('force:true bypasses the cache', async () => {
		global.fetch.mockResolvedValue(voicesResponse([{ voice_id: 'v1', name: 'A' }]));
		await listVoices();
		await listVoices({ force: true });
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('expires the cache after the TTL', async () => {
		vi.useFakeTimers();
		global.fetch.mockResolvedValue(voicesResponse([{ voice_id: 'v1', name: 'A' }]));
		await listVoices();
		vi.advanceTimersByTime(4 * 60 * 1000);
		expect((await listVoices()).cached).toBe(true);
		vi.advanceTimersByTime(2 * 60 * 1000); // now > 5-min TTL
		expect((await listVoices()).cached).toBe(false);
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('throws a 502 on a non-ok upstream response', async () => {
		global.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
		await expect(listVoices()).rejects.toMatchObject({ status: 502 });
	});

	it('throws a 502 when fetch itself rejects', async () => {
		global.fetch.mockRejectedValue(new Error('ECONNRESET'));
		await expect(listVoices()).rejects.toMatchObject({ status: 502 });
	});
});

describe('createClonedVoice', () => {
	it('throws a 503 when unconfigured', async () => {
		delete process.env.ELEVENLABS_API_KEY;
		await expect(createClonedVoice({ name: 'x', files: [] })).rejects.toMatchObject({
			status: 503,
		});
	});

	it('returns the voice id and verification flag on success', async () => {
		ivcCreate.mockResolvedValue({ voice_id: 'cloned-1', requires_verification: true });
		const res = await createClonedVoice({ name: 'Mine', files: ['f'] });
		expect(res).toEqual({ voiceId: 'cloned-1', requiresVerification: true });
	});

	it('defaults requiresVerification to false', async () => {
		ivcCreate.mockResolvedValue({ voice_id: 'cloned-2' });
		expect((await createClonedVoice({ name: 'Mine', files: ['f'] })).requiresVerification).toBe(
			false,
		);
	});

	it('preserves the upstream status code and body (e.g. 422 quota)', async () => {
		// ElevenLabsError exposes `statusCode` + `body`.
		ivcCreate.mockRejectedValue({ statusCode: 422, body: { detail: 'audio too short' } });
		await expect(createClonedVoice({ name: 'x', files: ['f'] })).rejects.toMatchObject({
			status: 422,
			upstreamBody: expect.stringContaining('audio too short'),
		});
	});

	it('falls back to 502 when the SDK error has no status', async () => {
		ivcCreate.mockRejectedValue(new Error('socket hang up'));
		await expect(createClonedVoice({ name: 'x', files: ['f'] })).rejects.toMatchObject({
			status: 502,
			upstreamBody: 'socket hang up',
		});
	});

	it('throws a 502 when the SDK returns no voice_id', async () => {
		ivcCreate.mockResolvedValue({});
		await expect(createClonedVoice({ name: 'x', files: ['f'] })).rejects.toMatchObject({
			status: 502,
		});
	});

	it('invalidates the voice cache so a new clone shows up immediately', async () => {
		global.fetch.mockResolvedValue(voicesResponse([{ voice_id: 'v1', name: 'A' }]));
		await listVoices(); // prime cache
		ivcCreate.mockResolvedValue({ voice_id: 'cloned-3' });
		await createClonedVoice({ name: 'New', files: ['f'] });
		await listVoices(); // must refetch
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});
});

describe('deleteVoice (best-effort)', () => {
	it('no-ops without a key or voice id', async () => {
		delete process.env.ELEVENLABS_API_KEY;
		await deleteVoice('v1');
		expect(global.fetch).not.toHaveBeenCalled();
		process.env.ELEVENLABS_API_KEY = 'sk_test_key';
		await deleteVoice('');
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('issues a DELETE with the api key header', async () => {
		global.fetch.mockResolvedValue({ ok: true, status: 200 });
		await deleteVoice('v-del');
		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, opts] = global.fetch.mock.calls[0];
		expect(url).toContain('/voices/v-del');
		expect(opts.method).toBe('DELETE');
		expect(opts.headers['xi-api-key']).toBe('sk_test_key');
	});

	it('never throws even if the upstream call fails', async () => {
		global.fetch.mockRejectedValue(new Error('network down'));
		await expect(deleteVoice('v-del')).resolves.toBeUndefined();
	});
});
