// Walk Playground — the page becomes a platformer level
// =====================================================
// Hands off from the corner Walk Companion (src/walk-companion.js): click the
// companion and it "detaches" from its spot into a full-viewport character you
// can actually walk around the page with. The page's real DOM — headings,
// cards, buttons, images, links — becomes solid ground. Walk and jump across it
// with the arrow keys / WASD (on-screen buttons on touch). Stand on a hyperlink
// and it opens like a trapdoor beneath you: the character dives through and you
// "fall into" the next page, dropping back in from the top on arrival.
//
// Why this lives in its own module: it is loaded with a dynamic import() the
// first time you detach, so a normal page never pays for the platformer's code
// or a second WebGL context — exactly the zero-footprint contract the companion
// already honors. It reuses the companion's shared building blocks: the same
// RobotExpressive rig + embedded clips, the same meshopt-only GLTFLoader, and
// the same global WebGL-context budget (reserve/release) so the two never run
// two contexts at once.

import {
	AmbientLight,
	AnimationMixer,
	Box3,
	DirectionalLight,
	Group,
	HemisphereLight,
	LoopOnce,
	LoopRepeat,
	OrthographicCamera,
	Scene,
	Timer,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getMeshoptDecoder } from './viewer/internal.js';
import { reserveWebGLContext, releaseWebGLContext } from './webgl-budget.js';
import { log } from './shared/log.js';

const ROBOT_URL = '/animations/robotexpressive.glb';
const RESUME_KEY = 'walk:playground:resume'; // sessionStorage flag: drop in on arrival

// ── Physics (CSS-pixel units, seconds) ───────────────────────────────────────
const CHAR_PX = 138; // rendered feet-to-head height
const GRAVITY = 2600;
const TERMINAL = 2400;
const MOVE_SPEED = 330;
const RUN_SPEED = 250; // |vx| above this plays the run clip
const JUMP_V = 1000; // ≈184px apex
const GROUND_ACCEL = 2600;
const AIR_ACCEL = 1400;
const FRICTION = 2400;
const FOOT_PAD = 26; // horizontal grace so you don't slip off pixel-exact edges
const LAND_TOL = 14; // vertical tolerance when snapping onto a surface
const LINK_ARM_MS = 850; // stand still on a link this long → trapdoor opens

// DOM elements that count as solid ground. Filtered further by size/visibility.
const SOLID_SELECTOR = [
	'a[href]',
	'button',
	'h1',
	'h2',
	'h3',
	'h4',
	'p',
	'li',
	'img',
	'figure',
	'.card',
	'[data-platform]',
].join(',');

function prefersReducedMotion() {
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}
function ssSet(key, val) {
	try {
		sessionStorage.setItem(key, val);
	} catch {
		/* non-fatal */
	}
}
function ssGet(key) {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}
function ssDel(key) {
	try {
		sessionStorage.removeItem(key);
	} catch {
		/* non-fatal */
	}
}
function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

function docWidth() {
	return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
}
function docHeight() {
	const el = document.scrollingElement || document.documentElement;
	return Math.max(el.scrollHeight, window.innerHeight || 0);
}
function maxScroll() {
	return Math.max(0, docHeight() - window.innerHeight);
}

// ── Animation controller (RobotExpressive clips) ─────────────────────────────
// States: idle / walk / run / jump. The platformer logic never branches on clip
// names — it just calls setState(); missing clips degrade gracefully to idle.
function makeController(root, clips) {
	const mixer = new AnimationMixer(root);
	const byName = (name) => clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
	const pick = (cands) => {
		for (const n of cands) {
			const c = byName(n);
			if (c) return c;
		}
		return null;
	};
	const map = {
		idle: pick(['Idle', 'idle']),
		walk: pick(['Walking', 'Walk', 'walk']),
		run: pick(['Running', 'Run', 'run', 'Walking', 'walk']),
		jump: pick(['Jump', 'jump', 'WalkJump']),
	};
	const action = {};
	for (const [state, clip] of Object.entries(map)) {
		if (!clip) continue;
		const a = mixer.clipAction(clip);
		a.enabled = true;
		action[state] = a;
	}

	let state = 'idle';
	let current = null;

	function crossfade(next, dur) {
		const a = action[next] || action.idle;
		if (!a) return;
		const once = next === 'jump';
		a.reset();
		a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
		a.clampWhenFinished = once;
		a.fadeIn(dur).play();
		if (current && current !== a) current.fadeOut(dur);
		current = a;
	}
	crossfade('idle', 0);

	return {
		setState(next) {
			if (next === state) return;
			state = next;
			crossfade(next, next === 'jump' ? 0.12 : 0.22);
		},
		update(dt) {
			mixer.update(dt);
		},
		dispose() {
			mixer.stopAllAction();
			mixer.uncacheRoot(root);
		},
	};
}

class WalkPlayground {
	constructor() {
		this.mounted = false;
		this._reduced = prefersReducedMotion();
		this._raf = 0;
		this._tick = this._tick.bind(this);
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onResize = this._onResize.bind(this);
		this._scheduleRescan = this._scheduleRescan.bind(this);

		// Character state, in document coordinates (feet position).
		this.char = { x: 0, y: 0, vx: 0, vy: 0, grounded: false, facing: 1 };
		this.platform = null; // platform currently stood on
		this.platforms = [];
		this._lastScan = 0;
		this._scrollY = 0;

		// Input flags.
		this.input = { left: false, right: false, jump: false, down: false };
		this._jumpEdge = false; // jump consumed until released (no auto-bunnyhop)

		// Link-trapdoor arming.
		this._armEl = null;
		this._armAt = 0;
		this._diving = false;

		// Fall-recovery: timestamp the character first dropped below the visible
		// viewport while the page could no longer scroll to follow. If it lingers
		// there he's truly lost off-screen, so we re-drop him back into view.
		this._airborneSince = 0;
	}

	async mount({ avatarId = null, startScreen = null, dropIn = false } = {}) {
		if (this.mounted) return;
		if (!this._webglSupported()) {
			log.warn('[walk-playground] WebGL unavailable');
			return;
		}
		this.mounted = true;
		this._avatarId = avatarId;

		this._buildDom();
		try {
			await this._buildScene();
		} catch (err) {
			log.warn('[walk-playground] failed to load avatar:', err?.message || err);
			this._teardown();
			return;
		}

		this._scrollY = window.scrollY || 0;
		this._scan(true);
		this._placeStart(startScreen, dropIn);
		// Grace period so the character can't auto-dive through a link it happens
		// to land on during the initial settle, before the user has any control.
		this._spawnGuardUntil = performance.now() + 1500;
		this._bindEvents();
		this._hintFor(dropIn);

		this.clock = new Timer();
		this._raf = requestAnimationFrame(this._tick);
	}

	unmount() {
		if (!this.mounted) return;
		this.mounted = false;
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		window.removeEventListener('keydown', this._onKeyDown, true);
		window.removeEventListener('keyup', this._onKeyUp, true);
		window.removeEventListener('resize', this._onResize);
		window.removeEventListener('scroll', this._scheduleRescan, true);
		this._clearArm();
		this._teardown();
	}

	// ── DOM scaffold (canvas + controls + hint) ──────────────────────────────
	_buildDom() {
		ensureStyles();
		const host = document.createElement('div');
		host.className = 'walk-pg';
		host.setAttribute('role', 'application');
		host.setAttribute('aria-label', 'Page playground — walk the character with arrow keys');
		host.innerHTML = `
			<canvas class="walk-pg-canvas"></canvas>
			<div class="walk-pg-hint" aria-live="polite"></div>
			<button type="button" class="walk-pg-exit" aria-label="Exit playground" title="Exit (Esc)">Exit ✕</button>
			<div class="walk-pg-pad" aria-hidden="true">
				<button type="button" class="walk-pg-btn" data-act="left" aria-label="Walk left">◀</button>
				<button type="button" class="walk-pg-btn" data-act="right" aria-label="Walk right">▶</button>
				<button type="button" class="walk-pg-btn walk-pg-jump" data-act="jump" aria-label="Jump">⤒</button>
				<button type="button" class="walk-pg-btn" data-act="down" aria-label="Dive into link">⤓</button>
			</div>
			<div class="walk-pg-flash" aria-hidden="true"></div>
		`;
		document.body.appendChild(host);
		this.host = host;
		this.canvas = host.querySelector('.walk-pg-canvas');
		this.hintEl = host.querySelector('.walk-pg-hint');
		this.flashEl = host.querySelector('.walk-pg-flash');
		host.querySelector('.walk-pg-exit').addEventListener('click', () => exitPlayground());

		// Touch / pointer controls — held while pressed.
		host.querySelectorAll('.walk-pg-btn').forEach((btn) => {
			const act = btn.getAttribute('data-act');
			const on = (e) => {
				e.preventDefault();
				this._setAct(act, true);
			};
			const off = (e) => {
				e.preventDefault();
				this._setAct(act, false);
			};
			btn.addEventListener('pointerdown', on);
			btn.addEventListener('pointerup', off);
			btn.addEventListener('pointerleave', off);
			btn.addEventListener('pointercancel', off);
		});
		requestAnimationFrame(() => host.classList.add('is-in'));
	}

	_setAct(act, val) {
		if (act === 'left') this.input.left = val;
		else if (act === 'right') this.input.right = val;
		else if (act === 'jump') {
			this.input.jump = val;
			if (!val) this._jumpEdge = false;
		} else if (act === 'down') this.input.down = val;
	}

	// ── Three.js scene: orthographic, 1 unit = 1 CSS pixel ────────────────────
	async _buildScene() {
		const renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer = renderer;
		reserveWebGLContext();
		this._resizeRenderer();

		const scene = new Scene();
		this.scene = scene;
		scene.add(new AmbientLight(0xffffff, 0.9));
		const hemi = new HemisphereLight(0xbcd6ff, 0x1a2230, 0.75);
		hemi.position.set(0, 200, 0);
		scene.add(hemi);
		const sun = new DirectionalLight(0xffffff, 1.7);
		sun.position.set(120, 260, 220);
		scene.add(sun);

		// Camera maps screen pixel (px, py) → world (px, -py); +Z toward viewer.
		this.camera = new OrthographicCamera(0, window.innerWidth, 0, -window.innerHeight, -1000, 2000);
		this.camera.position.z = 600;

		const rig = new Group();
		scene.add(rig);
		this.rig = rig;

		const loader = new GLTFLoader();
		loader.setMeshoptDecoder(await getMeshoptDecoder());
		// Detaching from the corner companion means the same default rig walks
		// out of its spot; an explicit ?avatar= is honored when the API serves it.
		const url = this._avatarId ? `/api/avatars/${encodeURIComponent(this._avatarId)}/glb` : ROBOT_URL;
		let gltf;
		try {
			gltf = await loader.loadAsync(url);
		} catch (err) {
			if (this._avatarId) {
				gltf = await loader.loadAsync(ROBOT_URL); // graceful fallback to shared rig
			} else {
				throw err;
			}
		}
		const model = gltf.scene;
		model.traverse((n) => {
			if (n.isMesh) n.frustumCulled = false;
		});

		// Scale to a fixed pixel height and drop feet to the rig origin.
		const box = new Box3().setFromObject(model);
		const size = box.getSize(new Vector3());
		const scale = CHAR_PX / Math.max(0.001, size.y);
		model.scale.setScalar(scale);
		const box2 = new Box3().setFromObject(model);
		const center = box2.getCenter(new Vector3());
		model.position.x -= center.x;
		model.position.z -= center.z;
		model.position.y -= box2.min.y;
		this.modelHalfW = (size.x * scale) / 2;
		rig.add(model);

		this.controller = makeController(model, gltf.animations || []);
	}

	_placeStart(startScreen, dropIn) {
		const sy = window.scrollY || 0;
		if (dropIn) {
			// Arrived by diving through a link on the previous page — fall in from
			// the top, centered, so navigation reads as continuous descent.
			this.char.x = clamp(docWidth() * 0.5, 40, docWidth() - 40);
			this.char.y = sy - CHAR_PX;
			this.char.vy = 60;
			this.char.grounded = false;
		} else if (startScreen) {
			// Detached from the companion's corner — step out from that exact spot.
			this.char.x = clamp(startScreen.x, 40, docWidth() - 40);
			this.char.y = startScreen.y + sy;
			this.char.vy = 40;
			this.char.grounded = false;
		} else {
			this.char.x = clamp(docWidth() * 0.5, 40, docWidth() - 40);
			this.char.y = sy + window.innerHeight * 0.3;
			this.char.vy = 0;
		}
	}

	// ── Platform scan from the live DOM ───────────────────────────────────────
	// Only elements within an expanded band around the viewport are considered,
	// so the platform set stays small and follows the user as they descend.
	_scan(force = false) {
		const now = performance.now();
		if (!force && now - this._lastScan < 180) return;
		this._lastScan = now;

		const sx = window.scrollX || 0;
		const sy = window.scrollY || 0;
		const bandTop = sy - 1100;
		const bandBottom = sy + window.innerHeight + 1100;
		const out = [];
		const seen = new Set();

		const els = document.querySelectorAll(SOLID_SELECTOR);
		for (const el of els) {
			if (out.length >= 360) break;
			if (this.host.contains(el)) continue;
			const r = el.getBoundingClientRect();
			if (r.width < 38 || r.height < 14 || r.height > 520) continue;
			const top = r.top + sy;
			const bottom = r.bottom + sy;
			if (bottom < bandTop || top > bandBottom) continue;
			const style = el.ownerDocument.defaultView.getComputedStyle(el);
			if (style.visibility === 'hidden' || style.display === 'none' || +style.opacity === 0) continue;
			const left = r.left + sx;
			const right = r.right + sx;
			const key = `${Math.round(left)},${Math.round(top)},${Math.round(right)}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const link = el.closest('a[href]');
			let href = null;
			if (link) {
				const raw = link.getAttribute('href') || '';
				if (raw && !raw.startsWith('#') && (!link.target || link.target === '_self')) {
					try {
						const u = new URL(raw, location.href);
						if (u.origin === location.origin) href = u.href;
					} catch {
						/* unparseable href — treat as plain platform */
					}
				}
			}
			out.push({ left, right, top, bottom, href, el });
		}

		// Always-present floor and ceiling so the character can never escape.
		const w = docWidth();
		out.push({ left: -40, right: w + 40, top: docHeight() - 3, bottom: docHeight(), href: null, el: null });
		this.platforms = out;

		// Keep standing on a platform that scrolled out of the rescan band.
		if (this.platform && !out.includes(this.platform)) {
			out.push(this.platform);
		}
	}

	_scheduleRescan() {
		this._scrollY = window.scrollY || 0;
		this._scan();
	}

	// ── Events ────────────────────────────────────────────────────────────────
	_bindEvents() {
		window.addEventListener('keydown', this._onKeyDown, true);
		window.addEventListener('keyup', this._onKeyUp, true);
		window.addEventListener('resize', this._onResize);
		window.addEventListener('scroll', this._scheduleRescan, true);
	}

	_onKeyDown(e) {
		const k = e.key;
		if (k === 'Escape') {
			exitPlayground();
			return;
		}
		let handled = true;
		if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.input.left = true;
		else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.input.right = true;
		else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Spacebar') this.input.jump = true;
		else if (k === 'ArrowDown' || k === 's' || k === 'S') this.input.down = true;
		else handled = false;
		if (handled) e.preventDefault();
	}

	_onKeyUp(e) {
		const k = e.key;
		if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.input.left = false;
		else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.input.right = false;
		else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Spacebar') {
			this.input.jump = false;
			this._jumpEdge = false;
		} else if (k === 'ArrowDown' || k === 's' || k === 'S') this.input.down = false;
	}

	_onResize() {
		this._resizeRenderer();
		if (this.camera) {
			this.camera.right = window.innerWidth;
			this.camera.bottom = -window.innerHeight;
			this.camera.updateProjectionMatrix();
		}
		this._scan(true);
	}

	_resizeRenderer() {
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
	}

	// ── Hints ─────────────────────────────────────────────────────────────────
	_hintFor(dropIn) {
		const touch = matchMedia('(pointer: coarse)').matches;
		const move = touch ? 'Use the buttons' : 'Arrow keys / WASD to move, Space to jump';
		this._say(dropIn ? `You fell in! ${move}. Land on a link to dive deeper.` : `${move}. Land on a link to dive in.`, 5200);
	}

	_say(text, ms = 3200) {
		if (!this.hintEl || !text) return;
		this.hintEl.textContent = text;
		this.hintEl.classList.add('is-in');
		clearTimeout(this._hintTimer);
		this._hintTimer = setTimeout(() => this.hintEl?.classList.remove('is-in'), ms);
	}

	// ── Link-trapdoor arming ──────────────────────────────────────────────────
	_armLink(p) {
		if (this._armEl === p.el) return;
		this._clearArm();
		this._armEl = p.el;
		this._armAt = performance.now();
		this._armHref = p.href;
		p.el.classList.add('walk-pg-portal');
		this._say('↓ to dive in', 2200);
	}

	_clearArm() {
		if (this._armEl) this._armEl.classList.remove('walk-pg-portal');
		this._armEl = null;
		this._armHref = null;
	}

	// ── Dive into the next page ───────────────────────────────────────────────
	_dive(href) {
		if (this._diving || !href) return;
		this._diving = true;
		this.controller?.setState('jump');
		if (this._armEl) this._armEl.classList.add('is-open');
		// Flag so the destination relaunches the playground and drops the
		// character in from the top — the "fall into the next page" payoff.
		ssSet(RESUME_KEY, '1');
		this.flashEl?.classList.add('is-on');
		const go = () => {
			location.href = href;
		};
		if (this._reduced) {
			go();
			return;
		}
		// Plummet the character, then navigate once the screen has faded.
		this.char.vx = 0;
		this.char.vy = TERMINAL;
		this.char.grounded = false;
		setTimeout(go, 620);
	}

	// ── Main loop ───────────────────────────────────────────────────────────────
	_tick() {
		if (!this.mounted) return;
		this.clock.update();
		const dt = Math.min(this.clock.getDelta(), 0.033);
		if (!this._diving) this._step(dt);
		this._follow(dt);
		this._render(dt);
		this._raf = requestAnimationFrame(this._tick);
	}

	_step(dt) {
		const c = this.char;

		// Horizontal input → acceleration with friction when idle.
		const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
		const accel = c.grounded ? GROUND_ACCEL : AIR_ACCEL;
		if (dir !== 0) {
			c.vx += dir * accel * dt;
			c.vx = clamp(c.vx, -MOVE_SPEED, MOVE_SPEED);
			c.facing = dir;
		} else if (c.grounded) {
			const f = FRICTION * dt;
			if (Math.abs(c.vx) <= f) c.vx = 0;
			else c.vx -= Math.sign(c.vx) * f;
		}

		// Jump (rising edge only).
		if (this.input.jump && c.grounded && !this._jumpEdge) {
			c.vy = -JUMP_V;
			c.grounded = false;
			this.platform = null;
			this._jumpEdge = true;
			this._clearArm();
		}

		// Drop / dive request.
		if (this.input.down && c.grounded) {
			if (this.platform?.href) {
				this._dive(this.platform.href);
				return;
			}
			// Drop through a normal platform to whatever is below.
			c.y += 4;
			c.grounded = false;
			const dropped = this.platform;
			this.platform = null;
			this._dropIgnore = dropped;
		}

		// Gravity.
		c.vy = Math.min(c.vy + GRAVITY * dt, TERMINAL);

		const prevY = c.y;
		c.x = clamp(c.x + c.vx * dt, this.modelHalfW, docWidth() - this.modelHalfW);
		c.y = c.y + c.vy * dt;

		// Land on the highest platform crossed from above this frame.
		if (c.vy >= 0) {
			let best = null;
			for (const p of this.platforms) {
				if (p === this._dropIgnore) continue;
				if (c.x < p.left - FOOT_PAD || c.x > p.right + FOOT_PAD) continue;
				if (prevY <= p.top + LAND_TOL && c.y >= p.top) {
					if (!best || p.top < best.top) best = p;
				}
			}
			if (best) {
				c.y = best.top;
				c.vy = 0;
				c.grounded = true;
				this.platform = best;
				this._dropIgnore = null;
			} else if (c.grounded && this.platform) {
				// Walked off the edge of the current platform?
				const p = this.platform;
				if (c.x < p.left - FOOT_PAD || c.x > p.right + FOOT_PAD) {
					c.grounded = false;
					this.platform = null;
				} else {
					c.y = p.top; // stay snapped
				}
			} else {
				c.grounded = false;
			}
		}

		// Fell off the bottom of the world on a page the camera can't scroll to
		// follow — give it a beat to confirm, then re-drop him into view so he's
		// never lost off-screen.
		const sy = window.scrollY || 0;
		if (!c.grounded && c.vy > 0 && c.y - sy > window.innerHeight * 1.25) {
			if (!this._airborneSince) this._airborneSince = performance.now();
			else if (performance.now() - this._airborneSince > 200) {
				this._recall();
				return;
			}
		} else {
			this._airborneSince = 0;
		}

		// Trapdoor arming: standing fairly still on a link opens it. Suppressed
		// during the spawn grace period so detaching onto a link isn't an instant
		// teleport — the user gets to take control first.
		const pastGuard = performance.now() > this._spawnGuardUntil;
		if (pastGuard && c.grounded && this.platform?.href && Math.abs(c.vx) < 30 && dir === 0) {
			this._armLink(this.platform);
			if (performance.now() - this._armAt > LINK_ARM_MS) {
				this._dive(this.platform.href);
				return;
			}
		} else if (this._armEl && (!c.grounded || this.platform?.el !== this._armEl || dir !== 0)) {
			this._clearArm();
		}

		// Animation state.
		let state = 'idle';
		if (!c.grounded) state = 'jump';
		else if (Math.abs(c.vx) > RUN_SPEED) state = 'run';
		else if (Math.abs(c.vx) > 6) state = 'walk';
		this.controller?.setState(state);
	}

	// Scroll the page so the character stays comfortably in view.
	_follow(dt) {
		const c = this.char;
		const vh = window.innerHeight;
		const cur = window.scrollY || 0;
		// Keep him ~55% down the viewport, easing smoothly — but track a fall
		// tighter (gravity reaches 2400px/s), or the lag slides him off the
		// bottom edge mid-plummet and the user loses sight of him.
		const target = c.y - vh * 0.55;
		const ease = c.grounded ? dt * 6 : dt * 12;
		let next = this._reduced ? target : cur + (target - cur) * Math.min(1, ease);
		// Hard visibility guarantee: never let his feet drop below 85% of the
		// viewport while the page can still scroll, so he's always findable.
		next = Math.max(next, c.y - vh * 0.85);
		next = clamp(next, 0, maxScroll());
		if (Math.abs(next - cur) > 0.5) window.scrollTo(0, next);
		this._scrollY = window.scrollY || 0;
		this._scan();
	}

	// Re-drop the character into the current view when a fall has carried him
	// off-screen on a page the camera can't scroll to follow (e.g. a non-
	// scrollable layout, where the document-bottom floor sits below the fold).
	// He lands on the highest platform under him that's on screen, or onto a
	// transient full-width ledge so he stops in view rather than vanishing.
	_recall() {
		this._scan(true);
		const sy = window.scrollY || 0;
		const vh = window.innerHeight;
		const x = clamp(this.char.x, this.modelHalfW, docWidth() - this.modelHalfW);
		let best = null;
		for (const p of this.platforms) {
			if (p.top < sy + 20 || p.top > sy + vh - 20) continue; // must be on screen
			if (x < p.left - FOOT_PAD || x > p.right + FOOT_PAD) continue; // under him
			if (!best || p.top < best.top) best = p;
		}
		if (!best) {
			best = { left: -40, right: docWidth() + 40, top: sy + vh * 0.35, bottom: sy + vh * 0.35 + 3, href: null, el: null };
			this.platforms.push(best);
		}
		this.char.x = x;
		this.char.y = best.top;
		this.char.vx = 0;
		this.char.vy = 0;
		this.char.grounded = true;
		this.platform = best;
		this._dropIgnore = null;
		this._airborneSince = 0;
		this.controller?.setState('idle');
		this._say('Caught you — back in view.', 2200);
	}

	_render(dt) {
		const c = this.char;
		const sx = window.scrollX || 0;
		const sy = window.scrollY || 0;
		const screenX = c.x - sx;
		const screenY = c.y - sy;
		this.rig.position.set(screenX, -screenY, 0);

		// 3/4 hero turn toward travel direction; spin while diving.
		if (this._diving) {
			this.rig.rotation.y += dt * 9;
			const s = Math.max(0.05, this.rig.scale.x - dt * 1.4);
			this.rig.scale.setScalar(s);
		} else {
			const targetYaw = c.facing >= 0 ? 0.6 : -0.6;
			this.rig.rotation.y += (targetYaw - this.rig.rotation.y) * Math.min(1, dt * 10);
		}

		this.controller?.update(dt);
		this.renderer.render(this.scene, this.camera);
	}

	_teardown() {
		try {
			this.controller?.dispose();
		} catch {
			/* non-fatal */
		}
		this.controller = null;
		if (this.scene) {
			this.scene.traverse((n) => {
				if (n.isMesh) {
					n.geometry?.dispose?.();
					const mats = Array.isArray(n.material) ? n.material : [n.material];
					mats.forEach((m) => {
						if (!m) return;
						for (const v of Object.values(m)) {
							if (v && v.isTexture) v.dispose();
						}
						m.dispose?.();
					});
				}
			});
		}
		this.scene = null;
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer.forceContextLoss?.();
			this.renderer = null;
			releaseWebGLContext();
		}
		if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
		this.host = null;
	}

	_webglSupported() {
		try {
			const c = document.createElement('canvas');
			return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
		} catch {
			return false;
		}
	}
}

// ── Scoped styles ─────────────────────────────────────────────────────────────
let _stylesInjected = false;
function ensureStyles() {
	if (_stylesInjected) return;
	_stylesInjected = true;
	const style = document.createElement('style');
	style.id = 'walk-pg-style';
	style.textContent = `
.walk-pg{position:fixed;inset:0;z-index:2147483100;pointer-events:none;opacity:0;transition:opacity .3s ease}
.walk-pg.is-in{opacity:1}
.walk-pg-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;filter:drop-shadow(0 22px 26px rgba(0,0,0,.34))}
.walk-pg-exit{position:fixed;top:14px;right:14px;z-index:3;pointer-events:auto;border:1px solid rgba(255,255,255,.16);background:rgba(14,16,22,.72);color:#f2f4f8;font:600 12.5px/1 system-ui,sans-serif;padding:9px 13px;border-radius:999px;cursor:pointer;backdrop-filter:blur(6px);transition:background .2s ease,transform .15s ease}
.walk-pg-exit:hover{background:rgba(220,60,60,.85)}
.walk-pg-exit:active{transform:scale(.96)}
.walk-pg-exit:focus-visible{outline:2px solid #7aa2ff;outline-offset:2px}
.walk-pg-hint{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(8px);z-index:3;pointer-events:none;max-width:88vw;width:max-content;background:rgba(18,20,28,.92);color:#f2f4f8;font:500 13px/1.4 system-ui,sans-serif;padding:9px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.35);opacity:0;transition:opacity .3s ease,transform .3s ease;text-align:center}
.walk-pg-hint.is-in{opacity:1;transform:translateX(-50%) translateY(0)}
.walk-pg-pad{position:fixed;left:0;right:0;bottom:18px;z-index:3;display:none;justify-content:center;gap:12px;pointer-events:none}
.walk-pg-btn{pointer-events:auto;width:60px;height:60px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(16,18,26,.78);color:#fff;font-size:22px;display:grid;place-items:center;backdrop-filter:blur(6px);-webkit-user-select:none;user-select:none;touch-action:none}
.walk-pg-btn:active{background:rgba(122,162,255,.5)}
.walk-pg-jump{background:rgba(122,162,255,.32)}
.walk-pg-flash{position:fixed;inset:0;z-index:2;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(122,162,255,0) 0%,rgba(8,10,16,0) 60%);opacity:0;transition:opacity .55s ease}
.walk-pg-flash.is-on{background:radial-gradient(circle at 50% 50%,rgba(122,162,255,.25) 0%,rgba(6,8,14,.96) 70%);opacity:1}
@media (pointer: coarse){.walk-pg-pad{display:flex}.walk-pg-hint{bottom:96px}}
.walk-pg-portal{outline:2px solid rgba(122,162,255,.9)!important;outline-offset:3px;border-radius:6px;box-shadow:0 0 0 4px rgba(122,162,255,.18),0 0 28px rgba(122,162,255,.45)!important;transition:box-shadow .2s ease,transform .25s ease;animation:walk-pg-pulse 1.1s ease-in-out infinite}
.walk-pg-portal.is-open{transform:scale(.94);box-shadow:0 0 0 6px rgba(122,162,255,.3),0 0 48px rgba(122,162,255,.7)!important}
@keyframes walk-pg-pulse{0%,100%{box-shadow:0 0 0 4px rgba(122,162,255,.16),0 0 22px rgba(122,162,255,.35)}50%{box-shadow:0 0 0 6px rgba(122,162,255,.3),0 0 36px rgba(122,162,255,.6)}}
@media (prefers-reduced-motion:reduce){.walk-pg,.walk-pg-hint,.walk-pg-flash{transition:none}.walk-pg-portal{animation:none}}
`;
	document.head.appendChild(style);
}

// ── Public API ────────────────────────────────────────────────────────────────
let _instance = null;

export function launchPlayground(opts = {}) {
	if (_instance) return _instance;
	_instance = new WalkPlayground();
	_instance.mount(opts);
	return _instance;
}

export function exitPlayground() {
	if (_instance) {
		_instance.unmount();
		_instance = null;
	}
	try {
		window.dispatchEvent(new CustomEvent('walk-playground:exit'));
	} catch {
		/* non-fatal */
	}
}

export function shouldDropIn() {
	return ssGet(RESUME_KEY) === '1';
}

export function consumeDropIn() {
	const v = ssGet(RESUME_KEY) === '1';
	if (v) ssDel(RESUME_KEY);
	return v;
}

// Read-only snapshot of the live character + world — handy for debugging the
// physics from the console (e.g. `__walkPlayground.state()`).
export function playgroundState() {
	if (!_instance || !_instance.mounted) return null;
	const c = _instance.char;
	return {
		x: Math.round(c.x),
		y: Math.round(c.y),
		vx: Math.round(c.vx),
		vy: Math.round(c.vy),
		grounded: c.grounded,
		facing: c.facing,
		platforms: _instance.platforms.length,
		onLink: !!_instance.platform?.href,
		diving: _instance._diving,
	};
}

if (typeof window !== 'undefined') {
	window.__walkPlayground = { launch: launchPlayground, exit: exitPlayground, state: playgroundState };
}
