// Tests for api/_lib/moderation.js — the free anonymous-chat pre-filter
// (NVIDIA NemoGuard). Pins the four mandated invariants:
//   1. BLOCK   — a parsed "unsafe" verdict flags the message.
//   2. ALLOW   — a parsed "safe" verdict lets it through.
//   3. FAIL-OPEN — any moderation outage (timeout / non-200 / network / garbage)
//                  proceeds un-moderated; the filter can never block on failure.
//   4. FLAG-OFF — the kill switch (ANON_MODERATION_DISABLED) bypasses entirely,
//                 without even touching the network.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
	moderationConfig,
	moderationEnabled,
	moderateAnonInput,
	parseVerdict,
	lastUserMessage,
	refusalReply,
} from '../../api/_lib/moderation.js';

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const fetchMock = vi.fn();

function nimReply(content) {
	return {
		ok: true,
		status: 200,
		json: async () => ({ choices: [{ message: { content } }] }),
		text: async () => '',
	};
}

function clearEnv() {
	delete process.env.NVIDIA_API_KEY;
	delete process.env.ANON_MODERATION_DISABLED;
	delete process.env.ANON_MODERATION_MODEL;
	delete process.env.ANON_MODERATION_TIMEOUT_MS;
}

beforeEach(() => {
	clearEnv();
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	clearEnv();
});

describe('moderationConfig / moderationEnabled', () => {
	it('is disabled with no key (fail-open: nothing to call)', () => {
		expect(moderationEnabled()).toBe(false);
		expect(moderationConfig().enabled).toBe(false);
	});

	it('is enabled when the NIM key is present', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		const cfg = moderationConfig();
		expect(cfg.enabled).toBe(true);
		expect(cfg.key).toBe('nvapi-test');
		expect(cfg.model).toMatch(/nemoguard/);
		expect(cfg.timeoutMs).toBe(2000);
	});

	it('kill switch ANON_MODERATION_DISABLED disables it even with a key', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.ANON_MODERATION_DISABLED = 'true';
		expect(moderationEnabled()).toBe(false);
	});

	it('honors model + timeout overrides (timeout is clamped)', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.ANON_MODERATION_MODEL = 'meta/llama-guard-4-12b';
		process.env.ANON_MODERATION_TIMEOUT_MS = '999999';
		const cfg = moderationConfig();
		expect(cfg.model).toBe('meta/llama-guard-4-12b');
		expect(cfg.timeoutMs).toBe(8000); // clamped to MAX
	});
});

describe('parseVerdict', () => {
	it('parses NemoGuard unsafe JSON with categories', () => {
		const v = parseVerdict('{"User Safety": "unsafe", "Safety Categories": "Guns, Criminal Planning"} ');
		expect(v.unsafe).toBe(true);
		expect(v.parsed).toBe(true);
		expect(v.categories).toEqual(['Guns', 'Criminal Planning']);
	});

	it('parses NemoGuard safe JSON', () => {
		const v = parseVerdict('{"User Safety": "safe"} ');
		expect(v.unsafe).toBe(false);
		expect(v.parsed).toBe(true);
		expect(v.categories).toEqual([]);
	});

	it('parses the Llama-Guard text form', () => {
		expect(parseVerdict('unsafe\nS9').unsafe).toBe(true);
		expect(parseVerdict('unsafe\nS9').categories).toEqual(['S9']);
		expect(parseVerdict('safe').unsafe).toBe(false);
	});

	it('treats unrecognized output as safe (fail-open) and marks it unparsed', () => {
		const v = parseVerdict('I think maybe this could be a problem?');
		expect(v.unsafe).toBe(false);
		expect(v.parsed).toBe(false);
	});

	it('handles empty/nullish content as unparsed-safe', () => {
		expect(parseVerdict('').parsed).toBe(false);
		expect(parseVerdict(null).unsafe).toBe(false);
	});
});

describe('lastUserMessage', () => {
	it('returns the latest user turn', () => {
		const msgs = [
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'reply' },
			{ role: 'user', content: 'second' },
		];
		expect(lastUserMessage(msgs)).toBe('second');
	});

	it('flattens multi-part content', () => {
		const msgs = [{ role: 'user', content: [{ text: 'hello' }, { text: 'world' }] }];
		expect(lastUserMessage(msgs)).toBe('hello world');
	});

	it('returns empty string for junk input', () => {
		expect(lastUserMessage(null)).toBe('');
		expect(lastUserMessage([{ role: 'assistant', content: 'x' }])).toBe('');
	});
});

describe('moderateAnonInput', () => {
	it('BLOCK: flags a parsed unsafe verdict', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockResolvedValueOnce(
			nimReply('{"User Safety": "unsafe", "Safety Categories": "Suicide and Self Harm"}'),
		);
		const r = await moderateAnonInput('something harmful');
		expect(r.flagged).toBe(true);
		expect(r.checked).toBe(true);
		expect(r.categories).toEqual(['Suicide and Self Harm']);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(NIM_URL);
	});

	it('ALLOW: a safe verdict passes through', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockResolvedValueOnce(nimReply('{"User Safety": "safe"}'));
		const r = await moderateAnonInput('what is the capital of France?');
		expect(r.flagged).toBe(false);
		expect(r.checked).toBe(true);
	});

	it('FAIL-OPEN: non-200 upstream does not flag', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' });
		const r = await moderateAnonInput('anything');
		expect(r.flagged).toBe(false);
		expect(r.checked).toBe(false);
		expect(r.error).toMatch(/403/);
	});

	it('FAIL-OPEN: a thrown/aborted fetch does not flag', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
		const r = await moderateAnonInput('anything');
		expect(r.flagged).toBe(false);
		expect(r.checked).toBe(false);
		expect(r.error).toBe('timeout');
	});

	it('FAIL-OPEN: garbage model output does not flag', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockResolvedValueOnce(nimReply('uh, I am not sure about that one'));
		const r = await moderateAnonInput('anything');
		expect(r.flagged).toBe(false);
		expect(r.checked).toBe(false);
	});

	it('FLAG-OFF: kill switch bypasses without touching the network', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.ANON_MODERATION_DISABLED = 'true';
		const r = await moderateAnonInput('something harmful');
		expect(r.flagged).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('FAIL-OPEN: no key configured → no call, no flag', async () => {
		const r = await moderateAnonInput('something harmful');
		expect(r.flagged).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('empty message is a no-op (nothing to moderate)', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		const r = await moderateAnonInput('   ');
		expect(r.flagged).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends the NemoGuard request shape (single user turn, temp 0)', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		fetchMock.mockResolvedValueOnce(nimReply('{"User Safety": "safe"}'));
		await moderateAnonInput('hello there');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.model).toMatch(/nemoguard/);
		expect(body.temperature).toBe(0);
		expect(body.messages).toEqual([{ role: 'user', content: 'hello there' }]);
		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer nvapi-test');
	});
});

describe('refusalReply', () => {
	it('is a non-empty, non-preachy in-band reply', () => {
		const r = refusalReply();
		expect(typeof r).toBe('string');
		expect(r.length).toBeGreaterThan(0);
		// no lecture / "as an AI" boilerplate
		expect(r.toLowerCase()).not.toMatch(/as an ai|i am just|policy|guidelines/);
	});
});
