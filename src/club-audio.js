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

export class ClubAudio {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.ambience = null; // { source, gain }
		this.style = null; // { name, source, gain }
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
		source.connect(gain).connect(this.master);
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
	rumba: 'Rumba mix',
	silly: 'Silly mix',
	thriller: 'Thriller mix',
	capoeira: 'Capoeira mix',
	hiphop: 'Hip Hop mix',
	pole: 'Pole choreography mix',
});
