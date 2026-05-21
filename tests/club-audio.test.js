// tests/club-audio.test.js
//
// ClubAudio (Web Audio API mixer) — unit tests.
//
// We can't run a real AudioContext in node, so the tests install a tiny fake
// Web Audio implementation on globalThis.window.AudioContext. The fake
// records linearRampToValueAtTime / cancelScheduledValues calls on each gain
// node so we can assert that crossfade scheduling matches the documented
// behaviour:
//
//   fadeToStyle(): ambience gain → 0.1, style gain → 0.75, both over durationMs.
//   fadeOutStyle(): style → 0,  ambience → 0.35.
//   setMuted(true)/false: master gain → 0 / 0.75 over 0.15s.
//
// The fake fetch handler returns a minimal ArrayBuffer; decodeAudioData
// resolves to a placeholder "buffer" object. Real audio decoding isn't
// exercised — only the scheduling graph is.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ClubAudio } from '../src/club-audio.js';

// ── Fake Web Audio impl ──────────────────────────────────────────────────────

class FakeAudioParam {
	constructor(initial = 0) {
		this.value = initial;
		this.events = []; // {type, value, time}
	}
	setValueAtTime(value, time) {
		this.value = value;
		this.events.push({ type: 'set', value, time });
		return this;
	}
	linearRampToValueAtTime(value, time) {
		this.value = value;
		this.events.push({ type: 'linearRamp', value, time });
		return this;
	}
	cancelScheduledValues(time) {
		this.events.push({ type: 'cancel', time });
		return this;
	}
	_lastRamp() {
		return [...this.events].reverse().find((e) => e.type === 'linearRamp');
	}
}

class FakeGainNode {
	constructor() {
		this.gain = new FakeAudioParam(1);
		this._connections = [];
	}
	connect(dest) {
		this._connections.push(dest);
		return dest;
	}
	disconnect() {
		this._connections = [];
	}
}

class FakeAnalyserNode {
	constructor() {
		this.fftSize = 256;
		this.smoothingTimeConstant = 0;
		this.frequencyBinCount = 128;
		this._connections = [];
	}
	connect(dest) {
		this._connections.push(dest);
		return dest;
	}
	disconnect() {
		this._connections = [];
	}
	getByteFrequencyData(buf) {
		// Constant mid-level energy across the spectrum so getPeak() returns
		// a deterministic non-zero value.
		buf.fill(128);
	}
}

class FakeBufferSource {
	constructor() {
		this.buffer = null;
		this.loop = false;
		this.started = false;
		this.stopped = false;
		this._connections = [];
	}
	connect(dest) {
		this._connections.push(dest);
		return dest;
	}
	disconnect() {
		this._connections = [];
	}
	start() {
		this.started = true;
	}
	stop() {
		this.stopped = true;
	}
}

class FakeAudioContext {
	constructor() {
		this.currentTime = 0;
		this.destination = { _label: 'destination' };
		this.state = 'running';
		this.createdGains = [];
		this.createdSources = [];
		this.createdAnalysers = [];
		this.decodedBuffers = [];
	}
	createGain() {
		const g = new FakeGainNode();
		this.createdGains.push(g);
		return g;
	}
	createAnalyser() {
		const a = new FakeAnalyserNode();
		this.createdAnalysers.push(a);
		return a;
	}
	createBufferSource() {
		const s = new FakeBufferSource();
		this.createdSources.push(s);
		return s;
	}
	async decodeAudioData(arrayBuffer) {
		const buf = { _fake: true, byteLength: arrayBuffer?.byteLength ?? 0 };
		this.decodedBuffers.push(buf);
		return buf;
	}
	async resume() {
		this.state = 'running';
	}
}

// ── Globals setup ────────────────────────────────────────────────────────────

let originalWindow;
let originalFetch;
let originalLocalStorage;

beforeEach(() => {
	originalWindow = globalThis.window;
	originalFetch = globalThis.fetch;
	originalLocalStorage = globalThis.localStorage;

	const fakeWindow = { AudioContext: FakeAudioContext };
	globalThis.window = fakeWindow;

	// In-memory localStorage so setMuted persistence doesn't touch disk.
	const store = new Map();
	globalThis.localStorage = {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => {
			store.set(k, String(v));
		},
		removeItem: (k) => {
			store.delete(k);
		},
		clear: () => {
			store.clear();
		},
	};

	// fetch returns a stub ArrayBuffer for any URL.
	globalThis.fetch = vi.fn(async () => ({
		ok: true,
		status: 200,
		arrayBuffer: async () => new ArrayBuffer(64),
	}));
});

afterEach(() => {
	globalThis.window = originalWindow;
	globalThis.fetch = originalFetch;
	globalThis.localStorage = originalLocalStorage;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClubAudio.ensureContext', () => {
	it('lazy-creates the AudioContext, master gain, and analyser', async () => {
		const audio = new ClubAudio();
		expect(audio.ctx).toBeNull();

		await audio.ensureContext();
		expect(audio.ctx).toBeInstanceOf(FakeAudioContext);
		expect(audio.master).toBeInstanceOf(FakeGainNode);
		expect(audio.analyser).toBeInstanceOf(FakeAnalyserNode);
		// Master gain should be set to the documented 0.75 default.
		expect(audio.master.gain.value).toBeCloseTo(0.75, 3);
	});

	it('is idempotent — re-calling does not allocate a new context', async () => {
		const audio = new ClubAudio();
		await audio.ensureContext();
		const ctx = audio.ctx;
		await audio.ensureContext();
		expect(audio.ctx).toBe(ctx);
	});
});

describe('ClubAudio.startAmbience', () => {
	it('loads ambience and starts a looping buffer source at the ambience gain', async () => {
		const audio = new ClubAudio();
		await audio.startAmbience();

		expect(audio.ambience).toBeTruthy();
		expect(audio.ambience.source.loop).toBe(true);
		expect(audio.ambience.source.started).toBe(true);
		expect(audio.ambience.gain.gain.value).toBeCloseTo(0.35, 3);
		// One buffer was decoded (ambience.ogg).
		expect(audio.ctx.decodedBuffers).toHaveLength(1);
	});

	it('does not start ambience twice', async () => {
		const audio = new ClubAudio();
		await audio.startAmbience();
		const firstSource = audio.ambience.source;
		await audio.startAmbience();
		expect(audio.ambience.source).toBe(firstSource);
	});
});

describe('ClubAudio.fadeToStyle', () => {
	it('crossfades ambience down to 0.1 and style up to 0.75', async () => {
		const audio = new ClubAudio();
		await audio.startAmbience();

		const duration = 800;
		audio.ctx.currentTime = 10;
		await audio.fadeToStyle('rumba', duration);

		expect(audio.style).toBeTruthy();
		expect(audio.style.name).toBe('rumba');
		expect(audio.style.source.loop).toBe(true);
		expect(audio.style.source.started).toBe(true);

		// Style layer ramps from 0 to 0.75 over 0.8s.
		const styleRamp = audio.style.gain.gain._lastRamp();
		expect(styleRamp).toBeTruthy();
		expect(styleRamp.value).toBeCloseTo(0.75, 3);
		expect(styleRamp.time).toBeCloseTo(10 + duration / 1000, 3);

		// Ambience layer ramps down to 0.1 over the same window.
		const ambienceRamp = audio.ambience.gain.gain._lastRamp();
		expect(ambienceRamp).toBeTruthy();
		expect(ambienceRamp.value).toBeCloseTo(0.1, 3);
		expect(ambienceRamp.time).toBeCloseTo(10 + duration / 1000, 3);
	});

	it('replacing an active style track fades the previous one out', async () => {
		const audio = new ClubAudio();
		await audio.startAmbience();
		await audio.fadeToStyle('rumba');
		const oldStyleGain = audio.style.gain;

		await audio.fadeToStyle('thriller');

		expect(audio.style.name).toBe('thriller');
		const oldRamp = oldStyleGain.gain._lastRamp();
		// Old style ramps to 0.
		expect(oldRamp).toBeTruthy();
		expect(oldRamp.value).toBeCloseTo(0, 3);
	});
});

describe('ClubAudio.fadeOutStyle', () => {
	it('ramps the active style to 0 and ambience back to 0.35', async () => {
		const audio = new ClubAudio();
		await audio.startAmbience();
		await audio.fadeToStyle('hiphop');

		const styleGain = audio.style.gain;
		audio.ctx.currentTime = 20;
		await audio.fadeOutStyle(800);

		expect(audio.style).toBeNull();

		const styleRamp = styleGain.gain._lastRamp();
		expect(styleRamp.value).toBeCloseTo(0, 3);
		expect(styleRamp.time).toBeCloseTo(20.8, 3);

		const ambienceRamp = audio.ambience.gain.gain._lastRamp();
		expect(ambienceRamp.value).toBeCloseTo(0.35, 3);
		expect(ambienceRamp.time).toBeCloseTo(20.8, 3);
	});

	it('no-ops cleanly when no context has been created', async () => {
		const audio = new ClubAudio();
		await expect(audio.fadeOutStyle()).resolves.toBeUndefined();
	});
});

describe('ClubAudio.setMuted', () => {
	it('ramps the master gain to 0 and back to 0.75 over 0.15s', async () => {
		const audio = new ClubAudio();
		await audio.ensureContext();

		audio.ctx.currentTime = 5;
		audio.setMuted(true);

		const muteRamp = audio.master.gain._lastRamp();
		expect(muteRamp).toBeTruthy();
		expect(muteRamp.value).toBeCloseTo(0, 3);
		expect(muteRamp.time).toBeCloseTo(5.15, 3);
		expect(audio.muted).toBe(true);

		audio.ctx.currentTime = 6;
		audio.setMuted(false);
		const unmuteRamp = audio.master.gain._lastRamp();
		expect(unmuteRamp.value).toBeCloseTo(0.75, 3);
		expect(unmuteRamp.time).toBeCloseTo(6.15, 3);
		expect(audio.muted).toBe(false);
	});

	it('persists mute preference to localStorage', async () => {
		const audio = new ClubAudio();
		await audio.ensureContext();
		audio.setMuted(true);
		expect(globalThis.localStorage.getItem('club.audio.muted')).toBe('1');
		audio.setMuted(false);
		expect(globalThis.localStorage.getItem('club.audio.muted')).toBe('0');
	});

	it('reads persisted mute preference on construction', () => {
		globalThis.localStorage.setItem('club.audio.muted', '1');
		const audio = new ClubAudio();
		expect(audio.muted).toBe(true);
	});
});

describe('ClubAudio.getPeak', () => {
	it('returns 0 before the context is created', () => {
		const audio = new ClubAudio();
		expect(audio.getPeak()).toBe(0);
	});

	it('returns a normalised 0..1 reading once the analyser exists', async () => {
		const audio = new ClubAudio();
		await audio.ensureContext();
		const peak = audio.getPeak();
		// FakeAnalyserNode fills the buffer with 128 → expected peak ~ 128/255.
		expect(peak).toBeGreaterThan(0.4);
		expect(peak).toBeLessThanOrEqual(1);
	});
});

describe('styleAudioFor', () => {
	it('maps known dance keys to tracks', async () => {
		const { styleAudioFor } = await import('../src/club-audio.js');
		expect(styleAudioFor('rumba')).toBe('rumba');
		expect(styleAudioFor('silly')).toBe('silly');
		expect(styleAudioFor('thriller')).toBe('thriller');
		expect(styleAudioFor('capoeira')).toBe('capoeira');
		expect(styleAudioFor('hiphop')).toBe('hiphop');
		expect(styleAudioFor('spin')).toBe('pole');
		expect(styleAudioFor('climb')).toBe('pole');
		expect(styleAudioFor('combo')).toBe('pole');
	});

	it('returns null for unknown dances', async () => {
		const { styleAudioFor } = await import('../src/club-audio.js');
		expect(styleAudioFor('breakdance')).toBeNull();
		expect(styleAudioFor('')).toBeNull();
		expect(styleAudioFor(null)).toBeNull();
	});
});

describe('Audio fetch fallback', () => {
	it('falls back from .ogg to .mp3 when the ogg fetch fails', async () => {
		const calls = [];
		globalThis.fetch = vi.fn(async (url) => {
			calls.push(url);
			if (url.endsWith('.ogg'))
				return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
			return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) };
		});
		const audio = new ClubAudio();
		await audio.startAmbience();
		expect(calls.some((u) => u.endsWith('ambience.ogg'))).toBe(true);
		expect(calls.some((u) => u.endsWith('ambience.mp3'))).toBe(true);
		expect(audio.ambience).toBeTruthy();
	});
});
