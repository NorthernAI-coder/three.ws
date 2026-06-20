// director.js — the brain of the Feature Tour. It walks the curriculum stop by
// stop: for each one it finds the real on-page element to showcase, spotlights
// it, walks the guide avatar over to point at it, draws a beam from the avatar
// to the feature, speaks the narration, and — unless paused — advances. When
// the next stop lives on another route it persists progress and navigates; the
// tour re-hydrates from sessionStorage on the new page and picks up exactly
// where it left off. One module owns all of that sequencing and every control.

import {
	loadCurriculum,
	readState,
	writeState,
	clearState,
	normalizePath,
	stopIndexForPath,
	sectionTitle,
} from './curriculum.js';
import { GuideAvatar } from './guide-avatar.js';
import { Spotlight } from './spotlight.js';
import { Narrator } from './narrator.js';
import { TourControls } from './controls.js';

const ADVANCE_BEAT_MS = 900; // pause between finishing a stop and moving on
const Z_BEAM = 2147483280;

export class TourDirector {
	constructor() {
		this.curriculum = null;
		this.index = 0;
		this.paused = false;
		this.muted = false;
		this.voice = 'nova';
		this.mounted = false;
		this.offRoute = false;
		this._runToken = 0;
		this._advanceTimer = 0;
		this._seenSections = new Set();
		this._beamRaf = 0;
		this._beamActive = false;
		this._onKey = this._onKey.bind(this);
	}

	// ── Entry points ──────────────────────────────────────────────────────────

	// Begin a fresh tour from the very first stop (called by the "Start tour"
	// button / ?tour=start). Navigates to stop 0's page if we're elsewhere.
	async start() {
		await this._ensureCurriculum();
		writeState({ active: true, index: 0, paused: false });
		this.index = 0;
		this.paused = false;
		const first = this.curriculum.stops[0];
		if (normalizePath(first.path) !== normalizePath()) {
			this._navigate(first.path);
			return;
		}
		await this._mount();
		this._runCurrent();
	}

	// Re-hydrate on a normal page load when a tour is already in progress.
	async resume() {
		const state = readState();
		if (!state.active) return;
		await this._ensureCurriculum();
		this.paused = state.paused;
		this.muted = state.muted;
		this.voice = state.voice || 'nova';

		const here = stopIndexForPath(this.curriculum, location.pathname);
		const wanted = state.index || 0;
		if (normalizePath(this.curriculum.stops[wanted]?.path) === normalizePath()) {
			this.index = wanted; // arrived exactly where we were heading
			this.offRoute = false;
		} else if (here >= 0) {
			this.index = here; // visitor hand-navigated to another stop's page
			this.offRoute = false;
			writeState({ index: here });
		} else {
			this.index = wanted; // wandered off the route entirely
			this.offRoute = true;
		}

		await this._mount();
		if (this.offRoute) {
			this._showOffRoute();
		} else {
			this._runCurrent();
		}
	}

	async _ensureCurriculum() {
		if (!this.curriculum) this.curriculum = await loadCurriculum();
	}

	// ── Mounting ──────────────────────────────────────────────────────────────
	async _mount() {
		if (this.mounted) return;
		this.mounted = true;
		this._buildBeam();
		this.spotlight = new Spotlight();
		this.narrator = new Narrator();
		this.avatar = new GuideAvatar();
		await this.avatar.mount();
		this.controls = new TourControls({
			onPrev: () => this._goTo(this.index - 1),
			onNext: () => this._goTo(this.index + 1),
			onToggle: () => this._togglePause(),
			onSeek: (i) => this._goTo(i),
			onMute: () => this._toggleMute(),
			onExit: () => this.exit(),
		});
		this.controls.setMuted(this.muted);
		this.controls.setPaused(this.paused);
		document.addEventListener('keydown', this._onKey);
	}

	// ── Running a stop ────────────────────────────────────────────────────────
	async _runCurrent() {
		const token = ++this._runToken;
		clearTimeout(this._advanceTimer);
		this.offRoute = false;
		const stop = this.curriculum.stops[this.index];
		if (!stop) return this._finish();

		this._syncControls();
		writeState({ index: this.index });

		// Chapter bridge — spoken once per section per session.
		if (stop.sectionIntro && !this._seenSections.has(stop.section)) {
			this._seenSections.add(stop.section);
			await this.avatar.park();
			if (token !== this._runToken) return;
			this.avatar.point();
			await this._present(stop.sectionIntro, token);
			if (token !== this._runToken) return;
		}

		// Move to the feature and point at it.
		const target = this._resolveTarget(stop);
		if (target) {
			await this.spotlight.highlight(target);
			if (token !== this._runToken) return;
			await this.avatar.approach(this.spotlight.getRect() || rectOf(target));
			if (token !== this._runToken) return;
			this._startBeam();
		} else {
			this.spotlight.highlight(null);
			this._stopBeam();
			await this.avatar.park();
			if (token !== this._runToken) return;
		}
		this.avatar.point();

		await this._narrateAndMaybeAdvance(token);
	}

	async _narrateAndMaybeAdvance(token) {
		await this._present(this.curriculum.stops[this.index].narration, token);
		if (token !== this._runToken) return;
		if (this.paused) return;
		this._advanceTimer = setTimeout(() => {
			if (token === this._runToken) this._advance();
		}, ADVANCE_BEAT_MS);
	}

	// Show caption + speak; resolves when the voice (or timed fallback) ends.
	async _present(text, token) {
		this.avatar.say(text);
		await this.narrator.speak(text, { muted: this.muted, voice: this.voice });
	}

	_advance() {
		const next = this.index + 1;
		if (next >= this.curriculum.stops.length) return this._finish();
		this.index = next;
		writeState({ index: next });
		const stop = this.curriculum.stops[next];
		if (normalizePath(stop.path) === normalizePath()) {
			this._runCurrent();
		} else {
			this._navigate(stop.path);
		}
	}

	// Jump to an arbitrary stop (prev / next / scrub). Navigates if off-page.
	_goTo(i) {
		const clamped = Math.max(0, Math.min(this.curriculum.stops.length - 1, i));
		this._runToken++; // cancel anything in flight
		clearTimeout(this._advanceTimer);
		this.narrator?.cancel();
		this.index = clamped;
		writeState({ index: clamped });
		const stop = this.curriculum.stops[clamped];
		if (normalizePath(stop.path) === normalizePath()) {
			this._runCurrent();
		} else {
			this._navigate(stop.path);
		}
	}

	_togglePause() {
		this.paused = !this.paused;
		writeState({ paused: this.paused });
		this.controls.setPaused(this.paused);
		if (this.paused) {
			clearTimeout(this._advanceTimer);
			this.narrator.cancel();
			this._runToken++; // freeze the current sequence
		} else if (this.offRoute) {
			this._goTo(this.index);
		} else {
			// Resume re-narrates the current stop, then continues.
			const token = ++this._runToken;
			this._narrateAndMaybeAdvance(token);
		}
	}

	_toggleMute() {
		this.muted = !this.muted;
		writeState({ muted: this.muted });
		this.controls.setMuted(this.muted);
		this.narrator.cancel();
		if (!this.paused) {
			const token = ++this._runToken;
			this._narrateAndMaybeAdvance(token);
		}
	}

	// ── Off-route recovery ────────────────────────────────────────────────────
	_showOffRoute() {
		this._stopBeam();
		this.spotlight.highlight(null);
		this.avatar.park();
		this.paused = true;
		writeState({ paused: true });
		this.controls.setPaused(true);
		this._syncControls();
		this.avatar.say('We stepped off the tour — press play and I’ll take you back to where we were.');
	}

	// ── Finish ────────────────────────────────────────────────────────────────
	async _finish() {
		const token = ++this._runToken;
		this._stopBeam();
		this.spotlight.highlight(null);
		await this.avatar.park();
		this.avatar.point();
		const outro = "And that's the whole platform. You've seen how to build an agent, give it a body and a voice, take it on-chain, and put it to work. Go make something — I'll be around if you want to walk it again.";
		await this._present(outro, token);
		clearState();
		this._showCompletion();
	}

	_showCompletion() {
		const card = document.createElement('div');
		card.className = 'tws-tour-done';
		card.innerHTML = `
			<div class="tws-tour-done__inner" role="dialog" aria-label="Tour complete">
				<div class="tws-tour-done__title">Tour complete 🎉</div>
				<p class="tws-tour-done__body">You've walked the whole of three.ws. Where to next?</p>
				<div class="tws-tour-done__actions">
					<a class="tws-tour-done__btn tws-tour-done__btn--primary" href="/create-agent">Build your agent</a>
					<button class="tws-tour-done__btn" data-act="restart">Walk it again</button>
					<button class="tws-tour-done__btn" data-act="close">Explore on my own</button>
				</div>
			</div>`;
		ensureDoneStyles();
		document.body.appendChild(card);
		requestAnimationFrame(() => card.classList.add('is-in'));
		card.addEventListener('click', (e) => {
			const act = e.target.closest('[data-act]')?.dataset.act;
			if (act === 'restart') {
				card.remove();
				this.start();
			} else if (act === 'close') {
				card.remove();
				this.exit();
			}
		});
		this._doneCard = card;
	}

	// ── Teardown ──────────────────────────────────────────────────────────────
	exit() {
		this._runToken++;
		clearTimeout(this._advanceTimer);
		clearState();
		this._stopBeam();
		this._beam?.remove();
		document.removeEventListener('keydown', this._onKey);
		this.narrator?.dispose();
		this.spotlight?.dispose();
		this.avatar?.dispose();
		this.controls?.dispose();
		this._doneCard?.remove();
		this.mounted = false;
	}

	// ── Target resolution ─────────────────────────────────────────────────────
	_resolveTarget(stop) {
		const selectors = [
			...(stop.targets || []),
			'[data-tour-target]',
			'main h1, .hero h1, h1',
			'a.cta, .btn-primary, button[type="submit"], main a.button, .hero a',
		];
		for (const sel of selectors) {
			let el;
			try {
				el = document.querySelector(sel);
			} catch {
				continue;
			}
			if (isVisible(el)) return el;
		}
		return null;
	}

	// ── Pointer beam (avatar → feature) ───────────────────────────────────────
	_buildBeam() {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'tws-tour-beam');
		svg.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;z-index:${Z_BEAM};pointer-events:none;opacity:0;transition:opacity .3s ease`;
		svg.innerHTML = `
			<defs>
				<marker id="tws-tour-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M0,0 L10,5 L0,10 z" fill="rgba(122,162,255,.95)"/>
				</marker>
			</defs>
			<line class="tws-tour-beam__line" stroke="rgba(122,162,255,.9)" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" marker-end="url(#tws-tour-arrow)"/>
		`;
		document.body.appendChild(svg);
		this._beam = svg;
		this._beamLine = svg.querySelector('.tws-tour-beam__line');
	}

	_startBeam() {
		if (this._beamActive) return;
		this._beamActive = true;
		this._beam.style.opacity = '1';
		const tick = () => {
			if (!this._beamActive) return;
			const rect = this.spotlight.getRect();
			const head = this.avatar.headScreen();
			if (rect && head) {
				// Aim at the nearest edge of the feature, not dead-center, so the
				// arrow lands on the box rather than burying itself inside it.
				const tx = clamp(head.x, rect.left, rect.left + rect.width);
				const ty = clamp(head.y, rect.top, rect.top + rect.height);
				this._beamLine.setAttribute('x1', head.x);
				this._beamLine.setAttribute('y1', head.y);
				this._beamLine.setAttribute('x2', tx);
				this._beamLine.setAttribute('y2', ty);
			}
			this._beamRaf = requestAnimationFrame(tick);
		};
		this._beamRaf = requestAnimationFrame(tick);
	}

	_stopBeam() {
		this._beamActive = false;
		cancelAnimationFrame(this._beamRaf);
		if (this._beam) this._beam.style.opacity = '0';
	}

	// ── Misc ──────────────────────────────────────────────────────────────────
	_syncControls() {
		const stop = this.curriculum.stops[this.index];
		this.controls.update({
			chapter: sectionTitle(this.curriculum, stop.section),
			index: this.index,
			total: this.curriculum.stops.length,
		});
	}

	_navigate(path) {
		// Progress is already persisted; the new page's bootstrap calls resume().
		location.assign(path);
	}

	_onKey(e) {
		if (isTypingTarget(e.target)) return;
		if (e.key === ' ' || e.key === 'k') {
			e.preventDefault();
			this._togglePause();
		} else if (e.key === 'ArrowRight') {
			this._goTo(this.index + 1);
		} else if (e.key === 'ArrowLeft') {
			this._goTo(this.index - 1);
		} else if (e.key === 'Escape') {
			this.exit();
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
function rectOf(el) {
	const r = el.getBoundingClientRect();
	return { left: r.left, top: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}
function isVisible(el) {
	if (!el || !el.isConnected) return false;
	const r = el.getBoundingClientRect();
	if (r.width < 4 || r.height < 4) return false;
	const style = getComputedStyle(el);
	return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}
function isTypingTarget(el) {
	if (!el) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

let _doneStyles = false;
function ensureDoneStyles() {
	if (_doneStyles) return;
	_doneStyles = true;
	const style = document.createElement('style');
	style.textContent = `
.tws-tour-done{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;background:rgba(6,8,12,.6);backdrop-filter:blur(6px);opacity:0;transition:opacity .35s ease;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.tws-tour-done.is-in{opacity:1}
.tws-tour-done__inner{background:#11141c;border:1px solid rgba(122,162,255,.25);border-radius:20px;padding:28px 30px;max-width:380px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.tws-tour-done__title{font-size:22px;font-weight:700;color:#f2f4f8;margin-bottom:8px}
.tws-tour-done__body{color:#aeb6c6;font-size:14px;line-height:1.5;margin:0 0 20px}
.tws-tour-done__actions{display:flex;flex-direction:column;gap:10px}
.tws-tour-done__btn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#eef1f6;padding:11px 16px;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:block;transition:background .18s ease,border-color .18s ease}
.tws-tour-done__btn:hover{background:rgba(255,255,255,.1)}
.tws-tour-done__btn--primary{background:linear-gradient(90deg,#7aa2ff,#9d7bff);color:#0b0e16;border-color:transparent}
.tws-tour-done__btn--primary:hover{filter:brightness(1.06)}
`;
	document.head.appendChild(style);
}
