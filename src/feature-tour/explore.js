// explore.js — the interactive "checkpoint" mode (site copy).
// ================================================
// Instead of the avatar walking itself, the VISITOR drives it: arrow keys / WASD
// on desktop, an on-screen joystick on touch. Each tour stop becomes a glowing
// GTA-style checkpoint anchored to its section. Walk the avatar into the active
// checkpoint and it stops, spotlights the section, and explains it — then the
// next checkpoint lights up. Reach them all to finish.
//
// It reuses the guided tour's own building blocks — the GuideAvatar rig (place /
// settle / say / point), the Spotlight, and the Narrator — so the body animates
// and speaks exactly as it does on the guided tour; only the locomotion changes
// from auto-walk to visitor-driven.

import { GuideAvatar } from './guide-avatar.js';
import { Spotlight } from './spotlight.js';
import { Narrator } from './narrator.js';
import { normalizePath } from './curriculum.js';

const MOVE_SPEED = 340; // px/s the visitor drives the avatar
const EDGE = 120; // viewport band (px) that auto-scrolls the page under the avatar
const SCROLL_MAX = 26; // px/frame at the very edge
const REACH_PAD = 26; // proximity forgiveness — checkpoints are generous
const Z_ZONE = 2147483080; // under the spotlight backdrop, over the page
const Z_HUD = 2147483400; // over everything, alongside the controls

export class ExploreMode {
	constructor(curriculum) {
		this.curriculum = curriculum;
		this.voice = 'nova';
		this.avatar = null;
		this.spotlight = null;
		this.narrator = null;
		this.stops = [];
		this.zones = [];
		this.active = 0;
		this.talking = false;
		this.running = false;
		this.pos = { x: 0, y: 0 };
		this.keys = new Set();
		this.joy = { x: 0, y: 0 };
		this._raf = 0;
		this._last = 0;
		this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._loop = this._loop.bind(this);
	}

	isActive() {
		return this.running;
	}

	async start() {
		if (this.running) return;
		this.running = true;

		// Only stops resolvable on the current page take part — explore is a
		// single-surface experience (one storefront page), not a cross-navigation
		// tour. Unresolved stops are skipped so a checkpoint is never unreachable.
		const here = normalizePath();
		const candidates = (this.curriculum?.stops || []).filter(
			(s) => !s.path || normalizePath(s.path) === here,
		);

		this._suppressCompanion();
		this.spotlight = new Spotlight();
		this.narrator = new Narrator();
		this.avatar = new GuideAvatar();
		await this.avatar.mount();

		// Resolve each stop to a live element now; keep only the ones we can point at.
		this.stops = candidates
			.map((stop) => ({ stop, el: this._resolveTarget(stop) }))
			.filter((s) => s.el);

		if (!this.stops.length) {
			// Nothing to walk to on this page — degrade to a friendly notice and exit
			// rather than dropping the visitor into an empty driving game.
			this._toast('Nothing to explore on this page yet.');
			this.exit();
			return;
		}

		injectStyles();
		this._buildZones();
		this._buildHud();
		this._buildJoystick();

		// Reduced motion: no driving game. Auto-walk each checkpoint in order and
		// narrate — the same information, none of the motion.
		if (this._reduced) {
			await this._runReduced();
			return;
		}

		// Spawn the avatar centred near the bottom, ready to drive up into the page.
		window.scrollTo({ top: 0, behavior: 'auto' });
		const s = this.avatar.size();
		this.pos = { x: (window.innerWidth - s.w) / 2, y: window.innerHeight - s.h - 40 };
		this.avatar.place(this.pos);
		this.avatar.settle();

		document.addEventListener('keydown', this._onKeyDown, true);
		document.addEventListener('keyup', this._onKeyUp, true);
		this._activate(0);
		this._last = performance.now();
		this._raf = requestAnimationFrame(this._loop);
	}

	exit() {
		this.running = false;
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		document.removeEventListener('keydown', this._onKeyDown, true);
		document.removeEventListener('keyup', this._onKeyUp, true);
		this.narrator?.cancel?.();
		this.spotlight?.dispose();
		this.avatar?.dispose();
		this.zones.forEach((z) => z.el.remove());
		this.zones = [];
		this._hud?.remove();
		this._hud = null;
		this._joy?.remove();
		this._joy = null;
		this._restoreCompanion();
	}

	// ── Driving loop ──────────────────────────────────────────────────────────
	_loop(now) {
		if (!this.running) return;
		const dt = Math.min((now - this._last) / 1000, 0.05);
		this._last = now;

		if (!this.talking) {
			let vx = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0) + this.joy.x;
			let vy = (this.keys.has('down') ? 1 : 0) - (this.keys.has('up') ? 1 : 0) + this.joy.y;
			const len = Math.hypot(vx, vy);
			if (len > 0.08) {
				if (len > 1) {
					vx /= len;
					vy /= len;
				}
				const s = this.avatar.size();
				let nx = this.pos.x + vx * MOVE_SPEED * dt;
				let ny = this.pos.y + vy * MOVE_SPEED * dt;
				// Auto-scroll the page when driving into the top/bottom band, keeping
				// the avatar pinned in the band so the world scrolls under it.
				const cy = ny + s.h / 2;
				if (vy < 0 && cy < EDGE && window.scrollY > 0) {
					window.scrollBy(0, -SCROLL_MAX);
					ny = this.pos.y;
				} else if (vy > 0 && cy > window.innerHeight - EDGE) {
					const max = document.documentElement.scrollHeight - window.innerHeight;
					if (window.scrollY < max) {
						window.scrollBy(0, SCROLL_MAX);
						ny = this.pos.y;
					}
				}
				this.avatar.place({ x: nx, y: ny });
				const r = this.avatar.host.getBoundingClientRect();
				this.pos = { x: r.left, y: r.top };
			} else {
				// keep our tracked pos honest even while parked (page may scroll)
				const r = this.avatar.host.getBoundingClientRect();
				this.pos = { x: r.left, y: r.top };
			}
		}

		this._updateZones();
		if (!this.talking) this._checkReach();
		this._raf = requestAnimationFrame(this._loop);
	}

	_checkReach() {
		const z = this.zones[this.active];
		if (!z || z.done) return;
		const s = this.avatar.size();
		const fx = this.pos.x + s.w / 2;
		const fy = this.pos.y + s.h * 0.72; // feet-ish
		const r = z.el.getBoundingClientRect();
		if (
			fx >= r.left - REACH_PAD &&
			fx <= r.right + REACH_PAD &&
			fy >= r.top - REACH_PAD &&
			fy <= r.bottom + REACH_PAD
		) {
			this._reach(this.active);
		}
	}

	async _reach(i) {
		const z = this.zones[i];
		if (!z || z.done || this.talking) return;
		this.talking = true;
		this.avatar.settle();
		z.el.classList.add('is-done');
		z.done = true;
		this.avatar.host.getBoundingClientRect(); // sync
		await this.spotlight.highlight(z.stop && this.stops[i].el);
		this.avatar.point();
		this.avatar.say?.(this.stops[i].stop.narration);
		this._setHud(i, true);
		await this.narrator.speak(this.stops[i].stop.narration, {
			muted: false,
			voice: this.voice,
			speed: 1,
		});
		if (!this.running) return;
		this.spotlight.highlight(null);
		const next = i + 1;
		if (next >= this.zones.length) {
			this._finish();
			return;
		}
		this._activate(next);
		this.talking = false;
	}

	_activate(i) {
		this.active = i;
		this.zones.forEach((z, idx) => {
			z.el.classList.toggle('is-active', idx === i && !z.done);
			z.el.classList.toggle('is-locked', idx > i && !z.done);
		});
		this._setHud(i, false);
	}

	_finish() {
		this.talking = true;
		this.spotlight.highlight(null);
		this._setHud(this.zones.length - 1, false, true);
		this.avatar.point?.();
	}

	// ── Reduced-motion fallback: auto-walk each checkpoint ────────────────────
	async _runReduced() {
		for (let i = 0; i < this.stops.length; i++) {
			if (!this.running) return;
			const el = this.stops[i].el;
			this.zones[i].el.classList.add('is-active');
			await this.spotlight.highlight(el);
			await this.avatar.approach(this.spotlight.getRect() || el.getBoundingClientRect());
			this.avatar.point();
			this.zones[i].el.classList.remove('is-active');
			this.zones[i].el.classList.add('is-done');
			this._setHud(i, true);
			await this.narrator.speak(this.stops[i].stop.narration, {
				muted: false,
				voice: this.voice,
				speed: 1,
			});
		}
		if (this.running) this._finish();
	}

	// ── Zones ─────────────────────────────────────────────────────────────────
	_buildZones() {
		this.zones = this.stops.map(({ stop }, i) => {
			const el = document.createElement('div');
			el.className = 'tws-cp is-locked';
			el.innerHTML = `<span class="tws-cp__num">${i + 1}</span><span class="tws-cp__ring"></span>`;
			el.setAttribute('aria-hidden', 'true');
			document.body.appendChild(el);
			return { el, stop, done: false };
		});
		this._updateZones();
	}

	_updateZones() {
		for (const z of this.zones) {
			const idx = this.zones.indexOf(z);
			const el = this.stops[idx].el;
			const r = el.getBoundingClientRect();
			// Park the marker at the section's bottom-centre — a floor pad you walk onto.
			const cx = r.left + r.width / 2;
			const cy = Math.min(window.innerHeight - 40, Math.max(40, r.bottom - 28));
			z.el.style.left = cx + 'px';
			z.el.style.top = cy + 'px';
			// hide markers that scrolled far off-screen so they don't pile at the edges
			const off = cy < -60 || cy > window.innerHeight + 60;
			z.el.style.opacity = off ? '0' : '';
		}
	}

	// ── HUD ───────────────────────────────────────────────────────────────────
	_buildHud() {
		const hud = document.createElement('div');
		hud.className = 'tws-cp-hud';
		hud.innerHTML = `
			<div class="tws-cp-hud__row">
				<span class="tws-cp-hud__badge" id="tws-cp-count"></span>
				<span class="tws-cp-hud__msg" id="tws-cp-msg"></span>
			</div>
			<div class="tws-cp-hud__dots" id="tws-cp-dots"></div>
			<button class="tws-cp-hud__exit" id="tws-cp-exit" aria-label="Exit">✕ Exit</button>`;
		document.body.appendChild(hud);
		this._hud = hud;
		const dots = hud.querySelector('#tws-cp-dots');
		dots.innerHTML = this.zones.map(() => '<i></i>').join('');
		hud.querySelector('#tws-cp-exit').addEventListener('click', () => this.exit());
	}

	_setHud(i, talking, done = false) {
		if (!this._hud) return;
		const total = this.zones.length;
		const reached = this.zones.filter((z) => z.done).length;
		const count = this._hud.querySelector('#tws-cp-count');
		const msg = this._hud.querySelector('#tws-cp-msg');
		const dots = [...this._hud.querySelectorAll('#tws-cp-dots i')];
		dots.forEach((d, idx) => {
			d.classList.toggle('done', this.zones[idx].done);
			d.classList.toggle('active', idx === i && !this.zones[idx].done);
		});
		if (done) {
			count.textContent = '🎉 All done';
			msg.textContent = `You found all ${total} spots. Press ✕ to finish.`;
			return;
		}
		count.textContent = `🎯 ${reached} / ${total}`;
		msg.textContent = talking
			? this.stops[i].stop.title || 'Here we are'
			: this._reduced
				? 'Sit back — walking you to each spot.'
				: this._touch
					? 'Drag the joystick to the glowing checkpoint.'
					: 'Use arrow keys to walk to the glowing checkpoint.';
	}

	// ── Joystick (touch) ──────────────────────────────────────────────────────
	_buildJoystick() {
		this._touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
		if (!this._touch || this._reduced) return;
		const base = document.createElement('div');
		base.className = 'tws-cp-joy';
		base.innerHTML = '<span class="tws-cp-joy__nub"></span>';
		document.body.appendChild(base);
		this._joy = base;
		const nub = base.querySelector('.tws-cp-joy__nub');
		let id = null;
		const R = 46;
		const set = (dx, dy) => {
			const len = Math.hypot(dx, dy) || 1;
			const cl = Math.min(1, len / R);
			this.joy = { x: (dx / len) * cl, y: (dy / len) * cl };
			nub.style.transform = `translate(${(dx / len) * cl * R}px, ${(dy / len) * cl * R}px)`;
		};
		const reset = () => {
			this.joy = { x: 0, y: 0 };
			nub.style.transform = 'translate(0,0)';
		};
		base.addEventListener('pointerdown', (e) => {
			id = e.pointerId;
			base.setPointerCapture(id);
			const r = base.getBoundingClientRect();
			base._cx = r.left + r.width / 2;
			base._cy = r.top + r.height / 2;
			set(e.clientX - base._cx, e.clientY - base._cy);
			e.preventDefault();
		});
		base.addEventListener('pointermove', (e) => {
			if (e.pointerId !== id) return;
			set(e.clientX - base._cx, e.clientY - base._cy);
		});
		const up = (e) => {
			if (e.pointerId !== id) return;
			id = null;
			reset();
		};
		base.addEventListener('pointerup', up);
		base.addEventListener('pointercancel', up);
	}

	// ── Keys ──────────────────────────────────────────────────────────────────
	_onKeyDown(e) {
		const k = KEYMAP[e.key];
		if (!k) return;
		if (isTyping(e.target)) return;
		this.keys.add(k);
		e.preventDefault(); // arrows would otherwise scroll the page natively
	}

	_onKeyUp(e) {
		const k = KEYMAP[e.key];
		if (k) this.keys.delete(k);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
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

	_toast(text) {
		const t = document.createElement('div');
		t.className = 'tws-cp-toast';
		t.textContent = text;
		document.body.appendChild(t);
		requestAnimationFrame(() => t.classList.add('is-in'));
		setTimeout(() => {
			t.classList.remove('is-in');
			setTimeout(() => t.remove(), 300);
		}, 2600);
	}

	_suppressCompanion() {
		const w = window.__walkCompanion;
		if (!w) return;
		const hide = () => {
			try {
				if (w.instance?.mounted) w.instance.unmount();
			} catch {}
		};
		hide();
		this._onCompanionChange = hide;
		window.addEventListener('walk-companion:change', hide);
	}

	_restoreCompanion() {
		if (this._onCompanionChange) {
			window.removeEventListener('walk-companion:change', this._onCompanionChange);
			this._onCompanionChange = null;
		}
	}
}

const KEYMAP = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	w: 'up',
	W: 'up',
	s: 'down',
	S: 'down',
	a: 'left',
	A: 'left',
	d: 'right',
	D: 'right',
};

function isTyping(el) {
	if (!el) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function isVisible(el) {
	if (!el || !el.isConnected) return false;
	const r = el.getBoundingClientRect();
	if (r.width < 4 || r.height < 4) return false;
	const style = getComputedStyle(el);
	return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

let _injected = false;
function injectStyles() {
	if (_injected) return;
	_injected = true;
	const style = document.createElement('style');
	style.id = 'tws-tour-explore-style';
	style.textContent = `
.tws-cp{position:fixed;z-index:${Z_ZONE};width:76px;height:76px;margin:-38px 0 0 -38px;pointer-events:none;display:grid;place-items:center;transition:opacity .3s ease}
.tws-cp__ring{position:absolute;inset:0;border-radius:50%;border:2px dashed rgba(122,162,255,.5);background:radial-gradient(circle,rgba(122,162,255,.16),transparent 68%)}
.tws-cp__num{position:relative;z-index:1;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:800 14px/1 system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;background:rgba(20,24,34,.85);border:1px solid rgba(122,162,255,.6);box-shadow:0 4px 14px rgba(0,0,0,.4)}
.tws-cp.is-locked{opacity:.42}
.tws-cp.is-active .tws-cp__ring{border-style:solid;border-color:rgba(110,231,183,.95);background:radial-gradient(circle,rgba(52,211,153,.3),transparent 66%);animation:tws-cp-pulse 1.4s ease-in-out infinite}
.tws-cp.is-active .tws-cp__num{background:linear-gradient(135deg,#34d399,#6ee7b7);color:#06231a;border-color:transparent}
.tws-cp.is-done .tws-cp__ring{border-style:solid;border-color:rgba(110,231,183,.5);background:none;animation:none}
.tws-cp.is-done .tws-cp__num{background:#34d399;color:#06231a;border-color:transparent}
.tws-cp.is-done .tws-cp__num::after{content:'✓'}
.tws-cp.is-done .tws-cp__num{font-size:0}
.tws-cp.is-done .tws-cp__num::after{font-size:16px}
@keyframes tws-cp-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.14);opacity:.55}}

.tws-cp-hud{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:${Z_HUD};display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 18px;background:rgba(14,16,22,.94);backdrop-filter:blur(12px);border:1px solid rgba(122,162,255,.28);border-radius:16px;color:#e7eaf2;font:600 13px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.5);max-width:min(520px,94vw)}
.tws-cp-hud__row{display:flex;align-items:center;gap:12px}
.tws-cp-hud__badge{font-weight:800;white-space:nowrap}
.tws-cp-hud__msg{color:#aeb6c8}
.tws-cp-hud__dots{display:flex;gap:6px}
.tws-cp-hud__dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18);transition:.2s}
.tws-cp-hud__dots i.active{background:#6ee7b7;box-shadow:0 0 8px rgba(110,231,183,.8);transform:scale(1.2)}
.tws-cp-hud__dots i.done{background:#34d399}
.tws-cp-hud__exit{position:absolute;top:-14px;right:-10px;border:1px solid rgba(255,255,255,.16);background:rgba(20,24,34,.95);color:#cfd5e4;font:700 11px/1 inherit;padding:6px 10px;border-radius:99px;cursor:pointer;pointer-events:auto}
.tws-cp-hud__exit:hover{color:#fff;border-color:rgba(248,113,113,.7)}

.tws-cp-joy{position:fixed;left:22px;bottom:96px;z-index:${Z_HUD};width:120px;height:120px;border-radius:50%;background:rgba(14,16,22,.5);border:1px solid rgba(122,162,255,.3);backdrop-filter:blur(6px);touch-action:none;pointer-events:auto;display:grid;place-items:center}
.tws-cp-joy__nub{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7aa2ff,#9d7bff);box-shadow:0 6px 18px rgba(0,0,0,.4);transition:transform .04s linear}

.tws-cp-toast{position:fixed;left:50%;top:20px;transform:translateX(-50%) translateY(-10px);z-index:${Z_HUD};padding:11px 18px;background:rgba(14,16,22,.95);border:1px solid rgba(122,162,255,.3);border-radius:12px;color:#e7eaf2;font:600 13px/1.3 system-ui,sans-serif;opacity:0;transition:.3s;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.tws-cp-toast.is-in{opacity:1;transform:translateX(-50%) translateY(0)}
@media (prefers-reduced-motion:reduce){.tws-cp.is-active .tws-cp__ring{animation:none}}
`;
	document.head.appendChild(style);
}
