// guide-avatar.js — the tour guide's body. A small, always-on-top 3D avatar
// that walks across the viewport to stand beside whatever the tour is showing,
// turns to face it, gestures at it, and carries a speech bubble above its head.
//
// It reuses the published walk-sdk avatar loader (loadWalkAvatar) so the guide
// is the same rig the visitor picked for the Walk Companion and can never freeze
// in a bind/T-pose, and the same simple controller surface — setState('walk' |
// 'idle') + playWave() — drives the walk-in and the point gesture.

import {
	AmbientLight,
	Box3,
	Timer,
	DirectionalLight,
	Group,
	HemisphereLight,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { loadWalkAvatar } from '../../walk-sdk/src/internal/load-avatar.js';
import { resolveConfig, resolveAvatarEntry } from '../../walk-sdk/src/config.js';

const CANVAS_W = 168;
const CANVAS_H = 240;
const MARGIN = 16;
const Z_AVATAR = 2147483300;

export class GuideAvatar {
	constructor() {
		this.config = resolveConfig({
			assetBase: '',
			apiBase: '',
			manifestUrl: '/animations/manifest.json',
			docsUrl: '/avatar-studio',
		});
		this.host = null;
		this.renderer = null;
		this.scene = null;
		this.camera = null;
		this.rig = null;
		this.model = null;
		this.controller = null;
		this.clock = null;
		this._raf = 0;
		this._yaw = 0;
		this._targetYaw = 0;
		this._walking = false;
		this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		this._pos = { x: 0, y: 0 };
		this._tick = this._tick.bind(this);
	}

	async mount() {
		ensureStyles();
		this._buildDom();
		// The DOM host (and its speech bubble) is built first, so even if WebGL or
		// the avatar GLB fail to load the tour degrades gracefully: captions still
		// show above the moving host, and the spotlight + pointer beam still work.
		// The guide just loses its rendered body rather than breaking the tour.
		try {
			await this._buildScene();
			this.clock = new Timer();
			this._raf = requestAnimationFrame(this._tick);
		} catch (err) {
			console.warn('[tour] guide avatar failed to load — continuing without a rendered body:', err?.message || err);
			this._headless = true;
			this.canvas?.remove();
		}
		// Park bottom-right until the first stop moves it.
		const start = { x: window.innerWidth - CANVAS_W - MARGIN, y: window.innerHeight - CANVAS_H - MARGIN };
		this._setPos(start, false);
	}

	_buildDom() {
		const host = document.createElement('div');
		host.className = 'tws-tour-guide';
		host.setAttribute('role', 'complementary');
		host.setAttribute('aria-label', 'Tour guide');
		host.innerHTML = `
			<div class="tws-tour-guide__bubble" hidden></div>
			<canvas class="tws-tour-guide__canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
		`;
		document.body.appendChild(host);
		this.host = host;
		this.canvas = host.querySelector('.tws-tour-guide__canvas');
		this.bubble = host.querySelector('.tws-tour-guide__bubble');
		requestAnimationFrame(() => host.classList.add('is-in'));
	}

	async _buildScene() {
		const renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
		renderer.setSize(CANVAS_W, CANVAS_H, false);
		this.renderer = renderer;

		const scene = new Scene();
		this.scene = scene;
		scene.add(new AmbientLight(0xffffff, 0.9));
		const hemi = new HemisphereLight(0xbcd6ff, 0x202830, 0.7);
		hemi.position.set(0, 4, 0);
		scene.add(hemi);
		const sun = new DirectionalLight(0xffffff, 1.6);
		sun.position.set(2, 5, 4);
		scene.add(sun);

		this.camera = new PerspectiveCamera(40, CANVAS_W / CANVAS_H, 0.05, 100);
		this.rig = new Group();
		scene.add(this.rig);

		const savedId = lsGet(this.config.keys.avatar) || this.config.defaultAvatarId;
		const entry = resolveAvatarEntry(savedId, this.config);
		const fallback = resolveAvatarEntry(this.config.defaultAvatarId, this.config);
		const { model, controller } = await loadWalkAvatar(entry, {
			assetBase: this.config.assetBase,
			apiBase: this.config.apiBase,
			manifestUrl: this.config.manifestUrl,
			fallbackEntry: fallback,
		});
		this.model = model;
		this.controller = controller;
		this._frame(model, this.rig, this.camera);
	}

	_frame(model, rig, camera) {
		const box = new Box3().setFromObject(model);
		const size = box.getSize(new Vector3());
		const center = box.getCenter(new Vector3());
		model.position.x -= center.x;
		model.position.z -= center.z;
		model.position.y -= box.min.y;
		rig.add(model);
		const height = Math.max(0.6, size.y);
		camera.position.set(0, height * 0.62, height * 2.2);
		camera.lookAt(0, height * 0.52, 0);
	}

	// ── Public choreography API ───────────────────────────────────────────────

	// Walk the avatar to a screen position (top-left of its canvas). Resolves
	// when it arrives. The CSS transition does the gliding; we just flip the
	// controller into its walk cycle for the duration.
	walkTo(pos) {
		const clamped = {
			x: clamp(pos.x, MARGIN, window.innerWidth - CANVAS_W - MARGIN),
			y: clamp(pos.y, MARGIN, window.innerHeight - CANVAS_H - MARGIN),
		};
		const dx = clamped.x - this._pos.x;
		const dy = clamped.y - this._pos.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 4) {
			this._setPos(clamped, false);
			return Promise.resolve();
		}
		// Face the direction of travel so the walk reads naturally.
		this._targetYaw = clamp((dx / window.innerWidth) * 1.6, -0.7, 0.7);
		const durMs = this._reduced ? 0 : clamp(dist * 1.6, 420, 1500);
		this.controller?.setState('walk');
		this._walking = true;
		this._setPos(clamped, !this._reduced, durMs);
		return new Promise((resolve) => {
			clearTimeout(this._walkTimer);
			this._walkTimer = setTimeout(() => {
				this._walking = false;
				this.controller?.setState('idle');
				resolve();
			}, durMs + 30);
		});
	}

	// Compute a resting spot beside a target rect (viewport coords), preferring
	// whichever side has room, and walk there + turn to face the target.
	async approach(rect) {
		const pos = this._spotBeside(rect);
		await this.walkTo(pos);
		this._faceRect(rect);
	}

	// Park in a neutral corner and face forward (whole-page stops).
	async park() {
		await this.walkTo({
			x: window.innerWidth - CANVAS_W - MARGIN,
			y: window.innerHeight - CANVAS_H - MARGIN,
		});
		this._targetYaw = 0;
	}

	// Point at the current target: a wave-style gesture toward it.
	point() {
		this.controller?.playWave();
	}

	// ── Free-roam hooks ─────────────────────────────────────────────────────────
	// The canvas host is pointer-events:none during the guided tour so it never
	// eats page clicks; free-roam flips it interactive so the guide can be grabbed.
	setInteractive(on) {
		if (!this.host) return;
		this.host.style.pointerEvents = on ? 'auto' : 'none';
		this.host.classList.toggle('is-roam', !!on);
	}

	// Footprint of the avatar host, for centering it under a pointer.
	size() {
		const r = this.host?.getBoundingClientRect();
		return { w: r?.width || CANVAS_W, h: r?.height || CANVAS_H };
	}

	// Instant placement (drag / edge-scroll follow): clamp to the viewport, face
	// the direction of travel, run the walk cycle, and auto-settle to idle shortly
	// after movement stops so a parked guide isn't stuck mid-stride.
	place(pos) {
		const s = this.size();
		const x = clamp(pos.x, MARGIN, window.innerWidth - s.w - MARGIN);
		const y = clamp(pos.y, MARGIN, window.innerHeight - s.h - MARGIN);
		const dx = x - this._pos.x;
		if (Math.abs(dx) > 1) this._targetYaw = clamp((dx / window.innerWidth) * 2, -0.7, 0.7);
		this.controller?.setState('walk');
		this._walking = true;
		clearTimeout(this._settleTimer);
		this._settleTimer = setTimeout(() => this.settle(), 180);
		this._setPos({ x, y }, false);
	}

	settle() {
		clearTimeout(this._settleTimer);
		this._walking = false;
		this._targetYaw = 0;
		this.controller?.setState('idle');
	}

	_spotBeside(rect) {
		const gap = 22;
		const rightX = rect.left + rect.width + gap;
		const leftX = rect.left - CANVAS_W - gap;
		let x;
		if (rightX + CANVAS_W <= window.innerWidth - MARGIN) x = rightX;
		else if (leftX >= MARGIN) x = leftX;
		else x = clamp(rect.cx - CANVAS_W / 2, MARGIN, window.innerWidth - CANVAS_W - MARGIN);
		const y = clamp(rect.cy - CANVAS_H * 0.58, MARGIN, window.innerHeight - CANVAS_H - MARGIN);
		return { x, y };
	}

	_faceRect(rect) {
		const avatarCx = this._pos.x + CANVAS_W / 2;
		this._targetYaw = clamp((rect.cx - avatarCx) / window.innerWidth, -0.6, 0.6);
	}

	// Approximate screen position of the avatar's head — origin for the pointer
	// beam the director draws to the highlighted element.
	headScreen() {
		return { x: this._pos.x + CANVAS_W / 2, y: this._pos.y + CANVAS_H * 0.18 };
	}

	// ── Speech bubble ─────────────────────────────────────────────────────────
	say(text) {
		if (!this.bubble) return;
		this.bubble.textContent = text;
		this.bubble.hidden = false;
		requestAnimationFrame(() => this.bubble.classList.add('is-in'));
	}
	hideBubble() {
		if (!this.bubble) return;
		this.bubble.classList.remove('is-in');
		setTimeout(() => {
			if (this.bubble) this.bubble.hidden = true;
		}, 280);
	}

	// ── Internals ─────────────────────────────────────────────────────────────
	_setPos(pos, animate, durMs = 600) {
		this._pos = pos;
		if (!this.host) return;
		this.host.style.transition = animate
			? `left ${durMs}ms cubic-bezier(.34,.02,.2,1), top ${durMs}ms cubic-bezier(.34,.02,.2,1)`
			: 'none';
		this.host.style.left = pos.x + 'px';
		this.host.style.top = pos.y + 'px';
	}

	_tick() {
		if (!this.host) return;
		this.clock.update();
		const dt = Math.min(this.clock.getDelta(), 0.05);
		this._yaw += (this._targetYaw - this._yaw) * 0.12;
		if (this.rig) this.rig.rotation.y = this._yaw;
		this.controller?.update(dt);
		this.renderer.render(this.scene, this.camera);
		this._raf = requestAnimationFrame(this._tick);
	}

	dispose() {
		cancelAnimationFrame(this._raf);
		clearTimeout(this._walkTimer);
		this._raf = 0;
		try {
			this.controller?.dispose();
		} catch {
			/* non-fatal */
		}
		if (this.scene) {
			this.scene.traverse((n) => {
				if (n.isMesh) disposeMesh(n);
			});
		}
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer.forceContextLoss?.();
		}
		this.host?.remove();
		this.host = null;
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
function lsGet(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function disposeMesh(n) {
	n.geometry?.dispose?.();
	const mats = Array.isArray(n.material) ? n.material : [n.material];
	mats.forEach((m) => {
		if (!m) return;
		for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
		m.dispose?.();
	});
}

let _stylesInjected = false;
function ensureStyles() {
	if (_stylesInjected) return;
	_stylesInjected = true;
	const style = document.createElement('style');
	style.id = 'tws-tour-guide-style';
	style.textContent = `
.tws-tour-guide{position:fixed;left:0;top:0;width:${CANVAS_W}px;height:${CANVAS_H}px;z-index:${Z_AVATAR};pointer-events:none;opacity:0;transform:translateY(10px);transition:opacity .4s ease,transform .4s ease;-webkit-user-select:none;user-select:none}
.tws-tour-guide.is-in{opacity:1;transform:translateY(0)}
.tws-tour-guide__canvas{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 16px 20px rgba(0,0,0,.34))}
.tws-tour-guide__bubble{position:absolute;left:50%;bottom:calc(100% - 30px);transform:translateX(-50%) translateY(8px);width:max-content;max-width:320px;background:rgba(18,20,28,.96);color:#f2f4f8;font:500 13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 13px;border-radius:14px;border:1px solid rgba(122,162,255,.28);box-shadow:0 12px 30px rgba(0,0,0,.4);opacity:0;transition:opacity .3s ease,transform .3s ease;text-align:left}
.tws-tour-guide__bubble.is-in{opacity:1;transform:translateX(-50%) translateY(0)}
.tws-tour-guide__bubble::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:7px solid transparent;border-top-color:rgba(18,20,28,.96)}
@media (max-width:560px){.tws-tour-guide{width:128px;height:182px}.tws-tour-guide__bubble{max-width:230px;font-size:12px}}
@media (prefers-reduced-motion:reduce){.tws-tour-guide,.tws-tour-guide__bubble{transition:opacity .2s ease}}
`;
	document.head.appendChild(style);
}
