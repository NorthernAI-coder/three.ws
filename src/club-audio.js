// /club audio mixer — crowd ambience under, per-style loops over the top.
//
// Browsers refuse to start an AudioContext before a user gesture, so the
// first tip click drives ensureContext(). After that:
//   - startAmbience() loops public/club/audio/ambience.{ogg,mp3} at a
//     soft constant gain so the room feels alive between performances.
//   - fadeToStyle(name) ducks ambience and brings the matching style loop
//     in over `durationMs` via linearRampToValueAtTime on the GainNodes.
//   - fadeOutStyle() reverses it.
//
// Only the master bus is wired through an AnalyserNode — getPeak() returns
// a normalised loudness reading the rim-light pulse can drive lighting from.
// No third-party libs (Howler/Tone). No setTimeout-faked beats. Real Web
// Audio API.

const AUDIO_BASE = '/club/audio';
// Try .ogg first (smaller, mono-q4); fall back to .mp3 on Safari/older
// browsers that lack Vorbis support.
const FORMATS = ['ogg', 'mp3'];

const AMBIENCE_GAIN = 0.35;
const STYLE_GAIN = 0.75;
const AMBIENCE_DUCK_GAIN = 0.1;
const MASTER_GAIN = 0.75;
// Walk-in anthem — plays once, full-volume, the moment the rope drops.
const ENTRANCE_GAIN = 0.9;

export class ClubAudio {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.ambience = null; // { source, gain }
		this.style = null; // { name, source, gain }
		this.entrance = null; // { source, gain } — one-shot walk-in anthem
		this._entrancePlayed = false;
		this.analyser = null;
		this._buffers = new Map(); // styleName → AudioBuffer
		this._loading = new Map(); // styleName → Promise<AudioBuffer>
		this._peakBuf = null; // Uint8Array reused for getByteFrequencyData
		this.muted = this._readMutedPref();
		this._onStatus = null; // optional callback(name, label)
	}

	onStatus(cb) {
		this._onStatus = typeof cb === 'function' ? cb : null;
	}

	async ensureContext() {
		if (this.ctx) {
			// On Safari the context can flip to "suspended" after a tab switch;
			// re-resume on every tip gesture is cheap and safe.
			if (this.ctx.state === 'suspended') {
				try {
					await this.ctx.resume();
				} catch {}
			}
			return;
		}
		const Ctor =
			typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
		if (!Ctor) {
			throw new Error('Web Audio API unavailable');
		}
		this.ctx = new Ctor();
		this.master = this.ctx.createGain();
		this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
		this.master.connect(this.ctx.destination);

		this.analyser = this.ctx.createAnalyser();
		this.analyser.fftSize = 256;
		this.analyser.smoothingTimeConstant = 0.55;
		this.master.connect(this.analyser);
		this._peakBuf = new Uint8Array(this.analyser.frequencyBinCount);

		// ── Outdoor / indoor effects chain ────────────────────────────────────
		// All audio layers connect to effectsBus instead of master directly.
		// Outdoor (default): heavy bass shelf, aggressive lowpass muffle,
		// long sparse reverb — sounds like the club heard through the door.
		// Indoor: open spectrum, tight room reverb, natural bass.
		this.effectsBus = this.ctx.createGain();
		this.effectsBus.gain.value = 1.0;

		this._fx = {};

		this._fx.bass = this.ctx.createBiquadFilter();
		this._fx.bass.type = 'lowshelf';
		this._fx.bass.frequency.value = 90;
		this._fx.bass.gain.value = 18;

		this._fx.lowpass = this.ctx.createBiquadFilter();
		this._fx.lowpass.type = 'lowpass';
		this._fx.lowpass.frequency.value = 420;
		this._fx.lowpass.Q.value = 1.0;

		this._fx.dry = this.ctx.createGain();
		this._fx.dry.gain.value = 0.22;

		// Outdoor reverb: 5s, sparse early reflections off building exterior
		this._fx.outdoorConv = this.ctx.createConvolver();
		this._fx.outdoorConv.buffer = this._buildIR(5.0, 1.0, 0.32);
		this._fx.outdoorWet = this.ctx.createGain();
		this._fx.outdoorWet.gain.value = 0.85;

		// Indoor reverb: 1.5s, dense club room reverb
		this._fx.indoorConv = this.ctx.createConvolver();
		this._fx.indoorConv.buffer = this._buildIR(1.5, 2.8, 1.0);
		this._fx.indoorWet = this.ctx.createGain();
		this._fx.indoorWet.gain.value = 0.0;

		// effectsBus → bass → lowpass → dry ──────────────────────────→ master
		//                             → outdoorConv → outdoorWet ──────→ master
		//                             → indoorConv  → indoorWet  ──────→ master
		this.effectsBus.connect(this._fx.bass);
		this._fx.bass.connect(this._fx.lowpass);
		this._fx.lowpass.connect(this._fx.dry);
		this._fx.lowpass.connect(this._fx.outdoorConv);
		this._fx.lowpass.connect(this._fx.indoorConv);
		this._fx.dry.connect(this.master);
		this._fx.outdoorConv.connect(this._fx.outdoorWet);
		this._fx.outdoorWet.connect(this.master);
		this._fx.indoorConv.connect(this._fx.indoorWet);
		this._fx.indoorWet.connect(this.master);

		if (this.ctx.state === 'suspended') {
			try {
				await this.ctx.resume();
			} catch {}
		}
	}

	async loadBuffer(name) {
		if (this._buffers.has(name)) return this._buffers.get(name);
		if (this._loading.has(name)) return this._loading.get(name);

		const p = (async () => {
			let lastErr = null;
			for (const ext of FORMATS) {
				const url = `${AUDIO_BASE}/${name}.${ext}`;
				try {
					const res = await fetch(url, { cache: 'force-cache' });
					if (!res.ok) {
						lastErr = new Error(`HTTP ${res.status} loading ${url}`);
						continue;
					}
					const bytes = await res.arrayBuffer();
					// decodeAudioData uses callbacks in old Safari; the
					// promise overload covers every browser we ship to.
					const buf = await this.ctx.decodeAudioData(bytes);
					this._buffers.set(name, buf);
					return buf;
				} catch (err) {
					lastErr = err;
				}
			}
			throw lastErr || new Error(`no playable audio at ${AUDIO_BASE}/${name}.*`);
		})();
		this._loading.set(name, p);
		try {
			return await p;
		} finally {
			this._loading.delete(name);
		}
	}

	_makeLayer(buffer, initialGain) {
		const source = this.ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		const gain = this.ctx.createGain();
		gain.gain.value = initialGain;
		source.connect(gain).connect(this.effectsBus);
		source.start();
		return { source, gain };
	}

	async startAmbience() {
		await this.ensureContext();
		if (this.ambience) return;
		const buf = await this.loadBuffer('ambience');
		// Guard against a parallel call having beaten us to it.
		if (this.ambience) return;
		this.ambience = this._makeLayer(buf, AMBIENCE_GAIN);
	}

	async fadeToStyle(name, durationMs = 800) {
		if (!name) return;
		await this.ensureContext();
		if (this.ctx.state === 'suspended') {
			try {
				await this.ctx.resume();
			} catch {}
		}
		const buf = await this.loadBuffer(name);

		const now = this.ctx.currentTime;
		const end = now + Math.max(0.05, durationMs / 1000);

		// Replace any currently-playing style layer.
		if (this.style) {
			this._fadeOutLayer(this.style, durationMs);
			this.style = null;
		}

		const layer = this._makeLayer(buf, 0);
		layer.gain.gain.cancelScheduledValues(now);
		layer.gain.gain.setValueAtTime(0, now);
		layer.gain.gain.linearRampToValueAtTime(STYLE_GAIN, end);
		this.style = { name, ...layer };

		if (this.ambience) {
			this.ambience.gain.gain.cancelScheduledValues(now);
			this.ambience.gain.gain.setValueAtTime(this.ambience.gain.gain.value, now);
			this.ambience.gain.gain.linearRampToValueAtTime(AMBIENCE_DUCK_GAIN, end);
		}

		if (this._onStatus) {
			try {
				this._onStatus(name);
			} catch {}
		}
		return this.style;
	}

	async fadeOutStyle(durationMs = 800) {
		if (!this.ctx) return;
		const now = this.ctx.currentTime;
		const end = now + Math.max(0.05, durationMs / 1000);

		if (this.style) {
			this._fadeOutLayer(this.style, durationMs);
			this.style = null;
		}
		if (this.ambience) {
			this.ambience.gain.gain.cancelScheduledValues(now);
			this.ambience.gain.gain.setValueAtTime(this.ambience.gain.gain.value, now);
			this.ambience.gain.gain.linearRampToValueAtTime(AMBIENCE_GAIN, end);
		}
	}

	// One-shot walk-in anthem: the moment the bouncer admits the wallet we
	// play `entrance.{ogg,mp3}` straight through (no loop), ducking any crowd
	// ambience under it and restoring it when the track ends. Routed through
	// the master bus, so the mute pill silences it like everything else.
	//
	// Throws if the AudioContext can't be unlocked (no user gesture yet) so
	// the caller can retry on the next interaction — and leaves
	// `_entrancePlayed` false in that case so the retry still fires.
	async playEntrance(name = 'entrance', { gain = ENTRANCE_GAIN } = {}) {
		if (this._entrancePlayed) return null;
		await this.ensureContext();
		if (this.ctx.state === 'suspended') {
			try {
				await this.ctx.resume();
			} catch {}
		}
		if (this.ctx.state === 'suspended') {
			throw new Error('AudioContext locked — needs a user gesture');
		}

		const buf = await this.loadBuffer(name);
		// A second caller may have won the race while we awaited the buffer.
		if (this._entrancePlayed) return null;
		this._entrancePlayed = true;

		const source = this.ctx.createBufferSource();
		source.buffer = buf;
		source.loop = false;
		const g = this.ctx.createGain();
		g.gain.value = gain;
		source.connect(g).connect(this.effectsBus);

		const now = this.ctx.currentTime;
		// Duck ambience under the anthem if it's already running.
		if (this.ambience) {
			this.ambience.gain.gain.cancelScheduledValues(now);
			this.ambience.gain.gain.setValueAtTime(this.ambience.gain.gain.value, now);
			this.ambience.gain.gain.linearRampToValueAtTime(AMBIENCE_DUCK_GAIN, now + 0.4);
		}

		source.onended = () => {
			try {
				source.disconnect();
			} catch {}
			// Bring ambience back up if it's still around when the anthem ends.
			if (this.ambience && this.ctx) {
				const t = this.ctx.currentTime;
				this.ambience.gain.gain.cancelScheduledValues(t);
				this.ambience.gain.gain.setValueAtTime(this.ambience.gain.gain.value, t);
				this.ambience.gain.gain.linearRampToValueAtTime(AMBIENCE_GAIN, t + 1.2);
			}
			this.entrance = null;
		};
		source.start();
		this.entrance = { source, gain: g };

		if (this._onStatus) {
			try {
				this._onStatus(name);
			} catch {}
		}
		return this.entrance;
	}

	// Synthetic impulse response for the convolver reverb.
	// outdoor: sparse early reflections (low density), slow decay — building exterior
	// indoor: dense full-room reverb, fast decay — club interior
	_buildIR(duration, decay, density) {
		const rate = this.ctx.sampleRate;
		const len = Math.floor(rate * duration);
		const buf = this.ctx.createBuffer(2, len, rate);
		for (let c = 0; c < 2; c++) {
			const ch = buf.getChannelData(c);
			for (let i = 0; i < len; i++) {
				const r =
					density >= 1
						? Math.random() * 2 - 1
						: Math.random() < density
							? Math.random() * 2 - 1
							: 0;
				ch[i] = r * Math.pow(1 - i / len, decay);
			}
		}
		return buf;
	}

	// Crossfade the effects chain between outdoor (heavy muffle + bass + long reverb)
	// and indoor (full spectrum + tight room reverb). Call with isInside=false when
	// the user is at the door; isInside=true on club:admitted.
	setLocation(isInside) {
		if (!this.ctx || !this._fx) return;
		const t = this.ctx.currentTime;
		const tc = 0.9; // exponential time constant — fully settled in ~2s

		if (isInside) {
			this._fx.lowpass.frequency.setTargetAtTime(17000, t, tc);
			this._fx.lowpass.Q.setTargetAtTime(0.5, t, tc);
			this._fx.bass.gain.setTargetAtTime(9, t, tc);
			this._fx.dry.gain.setTargetAtTime(0.65, t, tc);
			this._fx.outdoorWet.gain.setTargetAtTime(0.0, t, tc);
			this._fx.indoorWet.gain.setTargetAtTime(0.28, t, tc);
		} else {
			this._fx.lowpass.frequency.setTargetAtTime(420, t, tc);
			this._fx.lowpass.Q.setTargetAtTime(1.0, t, tc);
			this._fx.bass.gain.setTargetAtTime(18, t, tc);
			this._fx.dry.gain.setTargetAtTime(0.22, t, tc);
			this._fx.outdoorWet.gain.setTargetAtTime(0.85, t, tc);
			this._fx.indoorWet.gain.setTargetAtTime(0.0, t, tc);
		}
	}

	_fadeOutLayer(layer, durationMs) {
		const now = this.ctx.currentTime;
		const end = now + Math.max(0.05, durationMs / 1000);
		layer.gain.gain.cancelScheduledValues(now);
		layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
		layer.gain.gain.linearRampToValueAtTime(0, end);
		try {
			// Stop the source slightly after the fade completes so we don't
			// click. Some test stubs don't implement stop(t) — guard it.
			layer.source.stop(end + 0.05);
		} catch {}
	}

	getPeak() {
		if (!this.analyser || !this._peakBuf) return 0;
		this.analyser.getByteFrequencyData(this._peakBuf);
		// Average across the lower half of the spectrum — that's where the
		// kick/snare energy lives in our loops. Skipping the top half also
		// keeps the reading less twitchy on hi-hat-heavy hip-hop.
		const n = this._peakBuf.length >> 1;
		let sum = 0;
		for (let i = 0; i < n; i++) sum += this._peakBuf[i];
		return n > 0 ? sum / n / 255 : 0;
	}

	setMuted(v) {
		const muted = !!v;
		this.muted = muted;
		this._writeMutedPref(muted);
		if (!this.ctx || !this.master) return;
		const target = muted ? 0 : MASTER_GAIN;
		const now = this.ctx.currentTime;
		this.master.gain.cancelScheduledValues(now);
		this.master.gain.setValueAtTime(this.master.gain.value, now);
		this.master.gain.linearRampToValueAtTime(target, now + 0.15);
	}

	_readMutedPref() {
		try {
			if (typeof localStorage === 'undefined') return false;
			return localStorage.getItem('club.audio.muted') === '1';
		} catch {
			return false;
		}
	}

	_writeMutedPref(muted) {
		try {
			if (typeof localStorage === 'undefined') return;
			localStorage.setItem('club.audio.muted', muted ? '1' : '0');
		} catch {}
	}
}

// Map dance keys (as returned by /api/x402/dance-tip) to track names.
// Pole choreography clips (spin/climb/combo) share a single neutral loop.
const TRACK_BY_DANCE = Object.freeze({
	rumba: 'rumba',
	silly: 'silly',
	thriller: 'thriller',
	capoeira: 'capoeira',
	hiphop: 'hiphop',
	spin: 'pole',
	climb: 'pole',
	combo: 'pole',
});

export function styleAudioFor(dance) {
	if (!dance) return null;
	return TRACK_BY_DANCE[String(dance).toLowerCase()] || null;
}

// Display labels for screen-reader announcements.
export const TRACK_LABELS = Object.freeze({
	ambience: 'Crowd ambience',
	entrance: 'Walk-in anthem',
	rumba: 'Rumba mix',
	silly: 'Silly mix',
	thriller: 'Thriller mix',
	capoeira: 'Capoeira mix',
	hiphop: 'Hip Hop mix',
	pole: 'Pole choreography mix',
});
