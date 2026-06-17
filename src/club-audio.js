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

// ── Music bed ────────────────────────────────────────────────────────────────
// Full-length tracks are the club's soundtrack. Unlike the short synth loops
// (which decodeAudioData into memory), these stream through an <audio> element
// piped into the graph via createMediaElementSource — a 30 MB+ song never gets
// fully decoded into a Float32 buffer. The element loops the sequence below in
// order, forever: club anthem → the stripper cut → back to the top.
const MUSIC_SEQUENCE = ['club', 'im-in-love-wit-a-stripper-fast'];
const MUSIC_GAIN = 0.85;
// Ducked level while a tipped dancer's style loop or the walk-in anthem plays
// over the top, so the foreground track stays clearly audible.
const MUSIC_DUCK_GAIN = 0.18;

export class ClubAudio {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.ambience = null; // { source, gain }
		this.music = null; // { el, source, gain, index } — looping full-track bed
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

	// Start the full-length music bed and loop MUSIC_SEQUENCE forever
	// (club anthem → the stripper cut → back to the top). The track streams
	// through an <audio> element wired into the effects chain, so it picks up
	// the outdoor-muffle → indoor-clarity transition and the master mute for
	// free, and a 30 MB song never gets decoded into a Float32 buffer.
	//
	// Browser autoplay policy blocks the first play() until a user gesture, so
	// this rejects in that case — the caller catches it and retries on the next
	// interaction. `this.music` is wired up before the play attempt, so the
	// retry resumes the same element instead of building a second graph.
	async startMusic() {
		await this.ensureContext();
		if (this.ctx.state === 'suspended') {
			try {
				await this.ctx.resume();
			} catch {}
		}

		// Already wired — just make sure it's actually playing. Covers the
		// autoplay-blocked retry and a tab switch that paused the element.
		if (this.music) {
			await this.music.el.play();
			return this.music;
		}

		const AudioCtor =
			typeof window !== 'undefined' && window.Audio
				? window.Audio
				: typeof Audio !== 'undefined'
					? Audio
					: null;
		if (!AudioCtor) throw new Error('HTMLAudioElement unavailable');

		// One element, one MediaElementSource — the Web Audio API forbids a
		// second source node on the same element, so we swap `.src` between
		// tracks on `ended` rather than creating a node per track.
		const el = new AudioCtor();
		el.preload = 'auto';
		el.loop = false;
		const source = this.ctx.createMediaElementSource(el);
		const gain = this.ctx.createGain();
		// Start ducked if a foreground layer is already playing over the bed.
		gain.gain.value = this.style || this.entrance ? MUSIC_DUCK_GAIN : MUSIC_GAIN;
		source.connect(gain).connect(this.effectsBus);

		this.music = { el, source, gain, index: 0, errStreak: 0 };

		const srcFor = (i) => `${AUDIO_BASE}/${MUSIC_SEQUENCE[i]}.mp3`;
		const advance = (delta) => {
			const len = MUSIC_SEQUENCE.length;
			this.music.index = (((this.music.index + delta) % len) + len) % len;
			el.src = srcFor(this.music.index);
			el.play().catch(() => {});
			this._announceTrack(MUSIC_SEQUENCE[this.music.index]);
		};

		// A clean playthrough resets the failure streak; an error skips to the
		// next track. If every track in the sequence fails in a row we stop
		// advancing so one outage can't spin a hot reload loop.
		el.addEventListener('playing', () => {
			this.music.errStreak = 0;
		});
		el.addEventListener('ended', () => advance(1));
		el.addEventListener('error', () => {
			this.music.errStreak += 1;
			if (this.music.errStreak > MUSIC_SEQUENCE.length) return;
			advance(1);
		});

		// Kick off track 0. Keep this explicit (not via advance) so the first
		// play() rejection propagates to the caller's gesture-retry arming.
		el.src = srcFor(0);
		this._announceTrack(MUSIC_SEQUENCE[0]);
		await el.play();
		return this.music;
	}

	_announceTrack(name) {
		if (this._onStatus) {
			try {
				this._onStatus(name);
			} catch {}
		}
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

		this._duckBeds(durationMs);

		if (this._onStatus) {
			try {
				this._onStatus(name);
			} catch {}
		}
		return this.style;
	}

	async fadeOutStyle(durationMs = 800) {
		if (!this.ctx) return;

		if (this.style) {
			this._fadeOutLayer(this.style, durationMs);
			this.style = null;
		}
		this._restoreBeds(durationMs);
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

		// Duck the music beds under the anthem if either is already running.
		this._duckBeds(400);

		source.onended = () => {
			try {
				source.disconnect();
			} catch {}
			// Bring the beds back up when the anthem ends.
			this._restoreBeds(1200);
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

	// Ramp a single GainNode to `target`, gliding from its current value so the
	// fade is click-free even mid-ramp.
	_rampGain(gainNode, target, durationMs) {
		if (!gainNode || !this.ctx) return;
		const now = this.ctx.currentTime;
		const end = now + Math.max(0.05, durationMs / 1000);
		gainNode.gain.cancelScheduledValues(now);
		gainNode.gain.setValueAtTime(gainNode.gain.value, now);
		gainNode.gain.linearRampToValueAtTime(target, end);
	}

	// Duck both music beds — the synth ambience loop and the full-track music —
	// under a foreground layer (a tipped style loop or the walk-in anthem).
	_duckBeds(durationMs = 400) {
		this._rampGain(this.ambience?.gain, AMBIENCE_DUCK_GAIN, durationMs);
		this._rampGain(this.music?.gain, MUSIC_DUCK_GAIN, durationMs);
	}

	// Bring the music beds back up to their resting level.
	_restoreBeds(durationMs = 800) {
		this._rampGain(this.ambience?.gain, AMBIENCE_GAIN, durationMs);
		this._rampGain(this.music?.gain, MUSIC_GAIN, durationMs);
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
		// Pause/resume the streaming music element so muting actually halts the
		// download instead of just zeroing its gain; position is preserved.
		if (this.music?.el) {
			try {
				if (muted) this.music.el.pause();
				else this.music.el.play().catch(() => {});
			} catch {}
		}
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
	club: 'Club anthem',
	'im-in-love-wit-a-stripper-fast': 'In Love With a Stripper',
	rumba: 'Rumba mix',
	silly: 'Silly mix',
	thriller: 'Thriller mix',
	capoeira: 'Capoeira mix',
	hiphop: 'Hip Hop mix',
	pole: 'Pole choreography mix',
});
