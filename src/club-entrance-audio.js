// Approaching the club — the sound of a venue you can hear before you can see.
//
// A bass-forward loop sits behind the alley walls, heavily low-passed so only
// the deepest thump leaks out. As you walk toward the door the filter opens and
// the level rises — muffled-through-brick becomes here-it-is — and the moment
// the cover settles it bows out so the pole-stage anthem (src/club.js) owns the
// night. One self-contained Web Audio graph, armed on your first input (autoplay
// policy), and silent-failing throughout: audio is enhancement, never a gate.
//
//   bufferSource(loop) → lowpass(cutoff↑ with proximity) → master(gain↑) → out
//
// Reuses a venue loop already on disk (built by scripts/build-club-audio.mjs) —
// no new assets, no third-party samples.

const SOURCES = ['/club/audio/thriller.ogg', '/club/audio/thriller.mp3'];

// Far down the alley vs. standing in the doorway. Far = subsonic rumble only;
// near = louder and brighter as the doorway opens the sound up.
const FAR = { cutoff: 230, gain: 0.0 };
const NEAR = { cutoff: 1650, gain: 0.6 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class ClubApproachAudio {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.filter = null;
		this.source = null;
		this.buffer = null;
		this.proximity = 0; // eased 0 (far) … 1 (at the door)
		this._target = 0;
		this._handingOff = false;
		this._armed = false;
		this._disposed = false;
	}

	// First real user gesture (a keypress or drag). Idempotent; unlocks the
	// AudioContext that autoplay policy otherwise keeps suspended.
	arm() {
		if (this._armed || this._disposed) return;
		this._armed = true;
		this._start().catch(() => {});
	}

	async _start() {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		if (!Ctx) return;
		this.ctx = new Ctx();
		if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch {} }

		this.master = this.ctx.createGain();
		this.master.gain.value = 0.0001;
		this.filter = this.ctx.createBiquadFilter();
		this.filter.type = 'lowpass';
		this.filter.frequency.value = FAR.cutoff;
		this.filter.Q.value = 0.6;
		this.filter.connect(this.master);
		this.master.connect(this.ctx.destination);

		this.buffer = await this._load();
		if (!this.buffer || this._disposed) return;

		const src = this.ctx.createBufferSource();
		src.buffer = this.buffer;
		src.loop = true;
		src.connect(this.filter);
		try { src.start(); } catch { return; }
		this.source = src;
	}

	async _load() {
		for (const url of SOURCES) {
			try {
				const res = await fetch(url, { cache: 'force-cache' });
				if (!res.ok) continue;
				return await this.ctx.decodeAudioData(await res.arrayBuffer());
			} catch { /* try the next encoding */ }
		}
		return null;
	}

	// p in [0,1]: how close you are to the door (1 = right at it).
	setProximity(p) { this._target = clamp01(p); }

	// Cover paid — fade out; the anthem takes it from here.
	handOff() { this._handingOff = true; }

	// Per-frame: ease toward the target proximity (or zero while handing off)
	// and map it onto the filter cutoff + level with click-free ramps.
	update(dt) {
		if (!this.ctx || this._disposed) return;
		const goal = this._handingOff ? 0 : this._target;
		this.proximity += (goal - this.proximity) * (1 - Math.exp(-4 * dt));
		const now = this.ctx.currentTime;
		this.filter.frequency.setTargetAtTime(lerp(FAR.cutoff, NEAR.cutoff, this.proximity), now, 0.08);
		this.master.gain.setTargetAtTime(Math.max(0.0001, lerp(FAR.gain, NEAR.gain, this.proximity)), now, 0.08);
		if (this._handingOff && this.proximity < 0.01) this.dispose();
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		try { this.source?.stop(); } catch {}
		try { this.source?.disconnect(); } catch {}
		try { this.ctx?.close(); } catch {}
		this.ctx = this.master = this.filter = this.source = null;
	}
}
