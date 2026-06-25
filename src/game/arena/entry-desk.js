// Entry Desk — the in-world kiosk where a player submits a contest entry to
// Omniology with a real USDC-on-Solana x402 payment.
//
// Walk up to the desk (or tap it), press E, compose an entry, and confirm. The
// desk validates the entry locally FIRST (so a doomed entry is never charged),
// then hands { url, method, body } from the adapter's submitEntryRequest() to
// `POST /api/x402-pay` — the same server-side universal x402 payer the agent
// commerce flow uses (api/x402-pay.js → runExternalFlow). The payment lifecycle
// streams back as Server-Sent Events (challenge → built → settled → result) and
// drives a live stepper: every stage is a REAL event from the server, never a
// setTimeout fake. On success the new entry is pushed to the in-world screens
// (onSubmitted → screen.pushEntry) so it hits the ticker immediately.
//
// Two submission paths, selected by the adapter (entryFeeMode()), never a
// hardcoded flag here:
//   - paid/auto: stream through /api/x402-pay (auto-probes; a free endpoint just
//     resolves with free:true and moves no funds).
//   - free:      POST the submit URL directly, skipping the payment stepper.
//
// Contract: docs/omniology-arena/CONTRACTS.md §2.3. No mocks, no fake data: when
// Omniology is unconfigured the desk shows a designed "not live yet" state and
// charges nothing.

import {
	Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
	BoxGeometry, PlaneGeometry, RingGeometry, CylinderGeometry,
	CanvasTexture, SRGBColorSpace, DoubleSide, PointLight,
} from 'three';
import { payX402Stream } from '../../agent-x402-pay.js';
import {
	omniologyBase, submitEntryRequest, validateEntry, normalizeEntry,
	ENTRY_FIELDS, entryFeeMode, readEntryConfirmation,
} from './omniology-adapter.js';
import { log } from '../../shared/log.js';

const INTERACT_RANGE = 4.5;   // metres: how close to show the prompt / allow E
const SERVICE_LABEL = 'Omniology';
const CELEBRATE_MS_S = 1.1;   // celebration light/accent decay window, in seconds

// The x402 lifecycle, keyed to the SSE events /api/x402-pay's external flow emits
// (challenge → built → settled → result). Mirrors the agent-commerce stepper.
const STAGES = [
	{ id: 'challenge', label: 'Fee' },
	{ id: 'built', label: 'Sign' },
	{ id: 'settled', label: 'Settle' },
	{ id: 'done', label: 'Confirmed' },
];

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsdc = (micro) => `${((Number(micro) || 0) / 1e6).toFixed(4)} USDC`;
const shortAddr = (a) => (a ? `${String(a).slice(0, 6)}…${String(a).slice(-4)}` : '—');

// Small DOM factory (mirrors play-systems.el) so the compose UI stays
// dependency-free and is built from real nodes, never innerHTML of user input.
function el(tag, props = {}, kids = []) {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') n.className = v;
		else if (k === 'text') n.textContent = v;
		else if (k === 'html') n.innerHTML = v;
		else if (k === 'hidden') n.hidden = !!v;
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
		else if (v != null) n.setAttribute(k, v);
	}
	for (const c of [].concat(kids)) if (c) n.appendChild(c);
	return n;
}

const prefersReducedMotion = () =>
	typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;

function toVec(position) {
	if (!position) return { x: 0, y: 0, z: 0 };
	if (Array.isArray(position)) return { x: position[0] || 0, y: position[1] || 0, z: position[2] || 0 };
	if (position.isVector3) return { x: position.x, y: position.y, z: position.z };
	return { x: position.x || 0, y: position.y || 0, z: position.z || 0 };
}

/**
 * Build the entry desk and add it to the scene (CONTRACTS §2.3).
 *
 * @param {import('three').Scene} scene
 * @param {object} opts
 * @param {[number,number,number]|import('three').Vector3} opts.position  desk anchor (anchors.desk.pos)
 * @param {number} [opts.rotationY]                                       desk facing (anchors.desk.yaw)
 * @param {() => (string|null)} opts.getAgentId        current player's paying agent id
 * @param {() => (string|null)} opts.getContestId      current contest id (from the adapter feed)
 * @param {() => Promise<object|null>} [opts.buildEntry] opens the compose UI; resolves the entry, or null if cancelled. Defaults to the desk's built-in compose form.
 * @param {(info:{entryId:string|null, agent:string|null, payment:object|null}) => void} [opts.onSubmitted] wired to screen.pushEntry
 * @param {() => ({x:number,z:number})} [opts.getPlayer]  local player pose, for proximity (optional)
 * @param {() => (string|null)} [opts.getAgentName]       paying agent's display name (optional)
 * @param {{toast?:(msg:string,tone?:string)=>void}} [opts.ui]  toast surface (optional)
 * @returns {{ group:import('three').Group, update:(dt:number)=>void, interact:()=>void, dispose:()=>void }}
 */
export function createEntryDesk(scene, opts = {}) {
	const desk = new EntryDesk(scene, opts);
	return {
		group: desk.group,
		update: (dt) => desk.update(dt),
		interact: () => desk.interact(),
		dispose: () => desk.dispose(),
	};
}

class EntryDesk {
	constructor(scene, opts) {
		this.scene = scene;
		this.pos = toVec(opts.position);
		this.rotationY = Number(opts.rotationY) || 0;
		this.getAgentId = typeof opts.getAgentId === 'function' ? opts.getAgentId : () => null;
		this.getContestId = typeof opts.getContestId === 'function' ? opts.getContestId : () => null;
		this.getAgentName = typeof opts.getAgentName === 'function' ? opts.getAgentName : () => null;
		this.getPlayer = typeof opts.getPlayer === 'function' ? opts.getPlayer : null;
		this.onSubmitted = typeof opts.onSubmitted === 'function' ? opts.onSubmitted : () => {};
		this.buildEntry = typeof opts.buildEntry === 'function' ? opts.buildEntry : () => this._composeDefault();
		this.ui = opts.ui || null;

		this.busy = false;            // a submission flow is in flight
		this.composeOpen = false;     // the compose modal is open
		this._near = !this.getPlayer; // no player accessor → always interactable (bootstrap gates E)
		this._t = 0;
		this._ringT = 0;
		this._celebrateT = 0;
		this._submitted = new Set();  // contestIds already entered this session (one entry per round)
		this._amount = null;

		this._injectStyles();
		this._buildMesh();
		this._buildDom();
		this._onKey = (e) => this._handleKey(e);
		window.addEventListener('keydown', this._onKey);
	}

	// ── world mesh ────────────────────────────────────────────────────────────
	_buildMesh() {
		const group = new Group();
		group.position.set(this.pos.x, this.pos.y, this.pos.z);
		group.rotation.y = this.rotationY;
		this.group = group;

		const metal = new MeshStandardMaterial({ color: 0x16161a, roughness: 0.42, metalness: 0.72 });
		const base = new Mesh(new BoxGeometry(1.7, 1.0, 0.72), metal);
		base.position.y = 0.5;
		base.castShadow = true; base.receiveShadow = true;
		group.add(base);

		const top = new Mesh(new BoxGeometry(1.84, 0.09, 0.84), new MeshStandardMaterial({ color: 0x202028, roughness: 0.3, metalness: 0.8 }));
		top.position.y = 1.05;
		top.castShadow = true;
		group.add(top);

		// Front accent strip — the surface that pulses on a successful submission.
		this.accent = new Mesh(
			new BoxGeometry(1.62, 0.06, 0.02),
			new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
		);
		this.accent.position.set(0, 0.78, 0.37);
		group.add(this.accent);

		// Angled kiosk screen showing the call-to-action, painted on a canvas.
		this._screenCanvas = document.createElement('canvas');
		this._screenCanvas.width = 512; this._screenCanvas.height = 320;
		this._screenTex = new CanvasTexture(this._screenCanvas);
		this._screenTex.colorSpace = SRGBColorSpace;
		const screen = new Mesh(
			new PlaneGeometry(1.18, 0.74),
			new MeshBasicMaterial({ map: this._screenTex, transparent: true, side: DoubleSide }),
		);
		screen.position.set(0, 1.5, 0.18);
		screen.rotation.x = -0.32;
		group.add(screen);
		this._paintScreen('Enter the contest');

		// Riser holding the screen up off the counter.
		const riser = new Mesh(new CylinderGeometry(0.05, 0.05, 0.5, 12), metal);
		riser.position.set(0, 1.28, 0.05);
		riser.rotation.x = -0.32;
		group.add(riser);

		// Pulsing ground ring marks the desk as an interactable from across the room.
		this.ring = new Mesh(
			new RingGeometry(1.25, 1.55, 56),
			new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: DoubleSide }),
		);
		this.ring.rotation.x = -Math.PI / 2;
		this.ring.position.y = 0.03;
		group.add(this.ring);

		// Real light for the celebration pulse (off until a submission lands).
		this.celebrateLight = new PointLight(0xffffff, 0, 6, 2);
		this.celebrateLight.position.set(0, 1.7, 0.4);
		group.add(this.celebrateLight);

		this.scene.add(group);
	}

	_paintScreen(headline, sub) {
		// Skip redundant repaints — _syncActionButton calls this every frame while
		// the player is near, but the texture only changes on a state change.
		const key = `${headline} ${sub || ''}`;
		if (key === this._screenKey) return;
		this._screenKey = key;
		const c = this._screenCanvas;
		const x = c.getContext('2d');
		x.clearRect(0, 0, c.width, c.height);
		const g = x.createLinearGradient(0, 0, 0, c.height);
		g.addColorStop(0, '#121216'); g.addColorStop(1, '#0a0a0c');
		x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
		x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 3;
		x.strokeRect(8, 8, c.width - 16, c.height - 16);
		x.textAlign = 'center';
		x.fillStyle = 'rgba(255,255,255,0.55)';
		x.font = '700 26px Inter, system-ui, sans-serif';
		x.fillText('OMNIOLOGY', c.width / 2, 78);
		x.fillStyle = '#ffffff';
		x.font = '800 44px Inter, system-ui, sans-serif';
		x.fillText(headline, c.width / 2, 158);
		x.fillStyle = 'rgba(255,255,255,0.62)';
		x.font = '600 24px Inter, system-ui, sans-serif';
		x.fillText(sub || 'Press E to submit your entry', c.width / 2, 232);
		// Key cap.
		x.fillStyle = '#ffffff';
		const kw = 46, kh = 46, kx = c.width / 2 - kw / 2, ky = 256;
		x.fillRect(kx, ky, kw, kh);
		x.fillStyle = '#060607';
		x.font = '800 26px Inter, system-ui, sans-serif';
		x.fillText('E', c.width / 2, ky + 32);
		this._screenTex.needsUpdate = true;
	}

	// ── HUD DOM (prompt, compose modal, payment panel) ──────────────────────────
	_buildDom() {
		this.actionBtn = el('button', {
			class: 'ed-action', type: 'button', hidden: true,
			onclick: () => this.interact(),
		}, [el('span', { class: 'ed-action-key', text: 'E' }), el('span', { class: 'ed-action-label', text: 'Enter contest' })]);

		this.modalRoot = el('div', { class: 'ed-modal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Submit a contest entry' });
		this.panel = el('div', { class: 'ed-panel', hidden: true, role: 'status', 'aria-live': 'polite' });

		this.root = el('div', { class: 'ed-root' }, [this.actionBtn, this.modalRoot, this.panel]);
		document.body.appendChild(this.root);
	}

	_injectStyles() {
		if (document.getElementById('ed-styles')) return;
		const s = document.createElement('style');
		s.id = 'ed-styles';
		s.textContent = `
		.ed-root { font-family: Inter, system-ui, sans-serif; }
		.ed-action {
			position: fixed; left: 50%; bottom: 118px; transform: translateX(-50%);
			z-index: 26; display: inline-flex; align-items: center; gap: 9px;
			padding: 11px 18px; border-radius: 999px; cursor: pointer;
			background: var(--cc-panel-solid, #0c0c0e); color: var(--cc-text, #f5f5f6);
			border: 1px solid var(--cc-edge, rgba(255,255,255,0.16));
			box-shadow: var(--cc-shadow, 0 10px 34px rgba(0,0,0,0.6));
			font-size: 13px; font-weight: 700; letter-spacing: 0.03em;
			transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
		}
		.ed-action:hover { transform: translateX(-50%) translateY(-2px); border-color: rgba(255,255,255,0.5); }
		.ed-action:active { transform: translateX(-50%) translateY(0); }
		.ed-action:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.ed-action[disabled] { opacity: 0.55; cursor: default; pointer-events: none; }
		.ed-action-key {
			display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px;
			background: #fff; color: var(--cc-ink, #060607); border-radius: 4px; font-weight: 800; font-size: 11px;
		}

		.ed-modal {
			position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
			padding: 16px; background: rgba(4,4,6,0.62); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
			opacity: 0; transition: opacity 0.2s ease;
		}
		.ed-modal.ed-show { opacity: 1; }
		.ed-card {
			width: min(460px, 100%); max-height: calc(100vh - 32px); overflow-y: auto;
			background: var(--cc-panel-solid, #0c0c0e); color: var(--cc-text, #f5f5f6);
			border: 1px solid var(--cc-edge, rgba(255,255,255,0.14)); border-radius: 12px;
			box-shadow: 0 24px 70px rgba(0,0,0,0.75);
			transform: translateY(8px) scale(0.99); transition: transform 0.2s ease;
		}
		.ed-modal.ed-show .ed-card { transform: none; }
		.ed-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 16px 6px; }
		.ed-card-title { font-size: 15px; font-weight: 800; letter-spacing: 0.01em; }
		.ed-card-meta { margin-top: 3px; font-size: 11.5px; color: var(--cc-dim, #8c8c92); }
		.ed-x { background: none; border: none; color: var(--cc-dim, #8c8c92); font-size: 18px; line-height: 1; cursor: pointer; padding: 4px; border-radius: 6px; }
		.ed-x:hover { color: #fff; background: rgba(255,255,255,0.08); }
		.ed-x:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
		.ed-form { padding: 6px 16px 16px; display: flex; flex-direction: column; gap: 13px; }
		.ed-field { display: flex; flex-direction: column; gap: 5px; }
		.ed-field-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
		.ed-label { font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
		.ed-req { color: var(--cc-dim, #8c8c92); font-weight: 600; }
		.ed-count { font-size: 11px; color: var(--cc-faint, #5a5a60); font-variant-numeric: tabular-nums; }
		.ed-count.ed-over { color: #e06c75; }
		.ed-input, .ed-textarea {
			width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.04);
			border: 1px solid var(--cc-edge, rgba(255,255,255,0.14)); border-radius: 8px;
			color: var(--cc-text, #f5f5f6); font: inherit; font-size: 13px; padding: 9px 11px;
			transition: border-color 0.15s ease, box-shadow 0.15s ease;
		}
		.ed-textarea { resize: vertical; min-height: 84px; line-height: 1.45; }
		.ed-input::placeholder, .ed-textarea::placeholder { color: var(--cc-faint, #5a5a60); }
		.ed-input:hover, .ed-textarea:hover { border-color: rgba(255,255,255,0.28); }
		.ed-input:focus, .ed-textarea:focus { outline: none; border-color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.12); }
		.ed-field.ed-invalid .ed-input, .ed-field.ed-invalid .ed-textarea { border-color: #e06c75; }
		.ed-hint { font-size: 11px; color: var(--cc-faint, #5a5a60); }
		.ed-error { font-size: 11.5px; color: #e06c75; min-height: 0; }
		.ed-form-error { font-size: 12px; color: #e06c75; padding: 0 16px; }
		.ed-actions { display: flex; gap: 9px; justify-content: flex-end; padding: 4px 16px 16px; }
		.ed-btn {
			padding: 9px 16px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
			border: 1px solid var(--cc-edge, rgba(255,255,255,0.16)); background: transparent; color: var(--cc-text, #f5f5f6);
			transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease, opacity 0.14s ease;
		}
		.ed-btn:hover { border-color: rgba(255,255,255,0.5); transform: translateY(-1px); }
		.ed-btn:active { transform: translateY(0); }
		.ed-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.ed-btn-primary { background: #fff; color: var(--cc-ink, #060607); border-color: #fff; }
		.ed-btn-primary:hover { background: #ededed; }
		.ed-btn[disabled] { opacity: 0.5; cursor: default; pointer-events: none; }
		.ed-empty { padding: 18px 16px 20px; text-align: center; color: var(--cc-dim, #8c8c92); font-size: 13px; line-height: 1.5; }
		.ed-empty b { color: var(--cc-text, #f5f5f6); }

		.ed-panel {
			position: fixed; left: 50%; top: 84px; transform: translateX(-50%) translateY(-8px);
			z-index: 28; width: min(440px, calc(100vw - 28px));
			background: var(--cc-panel, rgba(12,12,14,0.94)); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
			border: 1px solid var(--cc-edge, rgba(255,255,255,0.14)); border-radius: 10px;
			box-shadow: 0 18px 56px rgba(0,0,0,0.72); color: var(--cc-text, #f5f5f6);
			padding: 13px 15px; opacity: 0; pointer-events: none; transition: opacity 0.22s ease, transform 0.22s ease;
		}
		.ed-panel.ed-show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
		.ed-ph { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
		.ed-pt { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cc-dim, #8c8c92); }
		.ed-pt b { color: var(--cc-text, #f5f5f6); }
		.ed-fee { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
		.ed-steps { display: flex; gap: 6px; }
		.ed-step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cc-faint, #5a5a60); }
		.ed-step .ed-dot { width: 100%; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); transition: background 0.2s ease; }
		.ed-step.is-active { color: var(--cc-dim, #8c8c92); }
		.ed-step.is-active .ed-dot { background: rgba(255,255,255,0.5); animation: ed-pulse 1s ease-in-out infinite; }
		.ed-step.is-done { color: var(--cc-text, #f5f5f6); }
		.ed-step.is-done .ed-dot { background: #fff; box-shadow: 0 0 8px rgba(255,255,255,0.6); }
		.ed-step.is-err .ed-dot { background: #e06c75; box-shadow: 0 0 8px rgba(224,108,117,0.6); }
		@keyframes ed-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
		.ed-sub { margin-top: 10px; font-size: 12.5px; line-height: 1.45; color: var(--cc-dim, #8c8c92); }
		.ed-sub b { color: var(--cc-text, #f5f5f6); }
		.ed-receipt { margin-top: 11px; padding-top: 11px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
		.ed-rrow { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; color: var(--cc-dim, #8c8c92); }
		.ed-rrow .ed-v { color: var(--cc-text, #f5f5f6); font-variant-numeric: tabular-nums; }
		.ed-rrow a { color: #fff; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.4); }
		.ed-rrow a:hover { border-bottom-color: #fff; }
		.ed-err-msg { margin-top: 10px; font-size: 12.5px; line-height: 1.45; color: var(--cc-text, #f5f5f6); }
		.ed-err-msg .ed-warn { color: #e0b46c; font-weight: 700; }
		@media (prefers-reduced-motion: reduce) {
			.ed-modal, .ed-card, .ed-panel, .ed-action, .ed-btn { transition: none !important; }
			.ed-step.is-active .ed-dot { animation: none !important; }
		}
		@media (max-width: 560px) { .ed-action { bottom: 150px; } }
		`;
		document.head.appendChild(s);
	}

	// ── proximity + per-frame ───────────────────────────────────────────────────
	_playerNear() {
		if (!this.getPlayer) return true;
		const p = this.getPlayer();
		if (!p) return false;
		return Math.hypot((p.x ?? 0) - this.pos.x, (p.z ?? 0) - this.pos.z) <= INTERACT_RANGE;
	}

	update(dt) {
		this._t += dt;
		const reduced = prefersReducedMotion();

		// Ground-ring breathing, brighter when the player is in range.
		this._near = this._playerNear();
		if (this.ring) {
			const base = this._near ? 0.34 : 0.16;
			this.ring.material.opacity = reduced ? base : base + 0.12 * (0.5 + 0.5 * Math.sin(this._t * 2));
		}

		// Celebration light decay.
		if (this._celebrateT > 0) {
			this._celebrateT = Math.max(0, this._celebrateT - dt);
			const k = this._celebrateT / CELEBRATE_MS_S;
			if (this.celebrateLight) this.celebrateLight.intensity = reduced ? (this._celebrateT > 0 ? 1.4 : 0) : 6 * k;
			if (this.accent) this.accent.material.opacity = 0.5 + 0.5 * k;
		}

		this._syncActionButton();
	}

	_syncActionButton() {
		const show = this._near && !this.busy && !this.composeOpen;
		const btn = this.actionBtn;
		if (!show) { if (!btn.hidden) btn.hidden = true; return; }
		const contestId = this.getContestId();
		const already = contestId && this._submitted.has(String(contestId));
		btn.hidden = false;
		btn.toggleAttribute('disabled', !!already);
		const label = btn.querySelector('.ed-action-label');
		const key = btn.querySelector('.ed-action-key');
		if (already) {
			if (key) key.hidden = true;
			if (label) label.textContent = 'Entered ✓';
			this._paintScreen('Entry submitted', 'You’re in this round');
		} else {
			if (key) key.hidden = false;
			if (label) label.textContent = 'Enter contest';
			this._paintScreen('Enter the contest');
		}
	}

	_handleKey(e) {
		if (e.key !== 'e' && e.key !== 'E') return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const t = e.target;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		if (!this._near || this.busy || this.composeOpen) return;
		e.preventDefault();
		this.interact();
	}

	// ── interaction → compose → submit ──────────────────────────────────────────
	interact() {
		if (this.busy || this.composeOpen) return;
		if (this.getPlayer && !this._playerNear()) return;

		if (!omniologyBase()) {
			this._toast('Omniology contests aren’t live here yet — check back soon.', 'info');
			return;
		}
		const contestId = this.getContestId();
		if (!contestId) {
			this._toast('No contest is open right now. Watch the screens for the next round.', 'info');
			return;
		}
		if (this._submitted.has(String(contestId))) {
			this._toast('You’ve already entered this round — one entry per round.', 'info');
			return;
		}
		this._run(contestId).catch((err) => log.warn('[entry-desk] submit failed:', err?.message));
	}

	async _run(contestId) {
		this.composeOpen = true;
		this.actionBtn.hidden = true;
		let entry;
		try {
			entry = await this.buildEntry();
		} finally {
			this.composeOpen = false;
		}
		if (!entry) return; // cancelled

		// Final guard: never submit (or pay) an entry that fails local validation.
		const v = validateEntry(entry);
		if (!v.ok) {
			this._toast('That entry isn’t valid yet — please fix the highlighted fields.', 'warn');
			return;
		}
		// The contest could have rolled over while the form was open.
		const liveContest = this.getContestId() || contestId;
		if (this._submitted.has(String(liveContest))) {
			this._toast('You’ve already entered this round.', 'info');
			return;
		}

		let request;
		try {
			request = submitEntryRequest(liveContest, normalizeEntry(entry), this.getAgentName());
		} catch (err) {
			this._toast(err?.message || 'Could not prepare the entry.', 'warn');
			return;
		}

		this.busy = true;
		try {
			const mode = entryFeeMode();
			const result = mode === 'free'
				? await this._submitFree(request)
				: await this._submitPaid(request);
			this._onSuccess(liveContest, result);
		} catch (err) {
			this._renderError(err);
		} finally {
			this.busy = false;
		}
	}

	// Free path: POST the submit URL directly, no x402, no stepper (CONTRACTS §1.2).
	async _submitFree(request) {
		this._renderPanel({ stage: null, free: true });
		this.panel.classList.add('ed-show');
		let res;
		try {
			res = await fetch(request.url, {
				method: request.method,
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(request.body),
			});
		} catch {
			throw Object.assign(new Error('Could not reach Omniology to submit your entry.'), { code: 'endpoint_unreachable' });
		}
		let body = null;
		try { body = await res.json(); } catch { body = null; }
		if (!res.ok) {
			const msg = (body && (body.error_description || body.error)) || `Omniology rejected the entry (HTTP ${res.status}).`;
			throw Object.assign(new Error(msg), { code: body?.code || 'submit_rejected', status: res.status });
		}
		return { ok: true, free: true, result: body, payment: null };
	}

	// Paid/auto path: stream the real x402 lifecycle from /api/x402-pay. Every
	// stepper stage below is driven by a genuine SSE event — no fake progress.
	async _submitPaid(request) {
		const agentId = this.getAgentId();
		if (!agentId) {
			throw Object.assign(
				new Error('Connect a paying agent wallet to enter — entries settle from your agent’s Solana USDC.'),
				{ code: 'agent_required' },
			);
		}
		this._amount = null;
		this._renderPanel({ stage: 'challenge', active: true });
		this.panel.classList.add('ed-show');

		const onEvent = (event, data) => {
			if (event === 'challenge') {
				if (data?.amount != null) this._amount = data.amount;
				this._renderPanel({ stage: 'built', active: true, sub: 'Fee · awaiting signature' });
			} else if (event === 'built') {
				this._renderPanel({ stage: 'settled', active: true, sub: 'Signed · settling on Solana' });
			} else if (event === 'settled') {
				this._explorer = data?.explorer || (data?.tx ? `https://solscan.io/tx/${data.tx}` : null);
				this._renderPanel({ stage: 'done', active: true, sub: 'Settled on Solana', explorer: this._explorer });
			}
			// 'result'/'error' are handled by payX402Stream's resolve/throw below.
		};

		return payX402Stream(
			{ agentId, url: request.url, method: request.method, body: request.body, serviceLabel: SERVICE_LABEL },
			onEvent,
		);
	}

	_onSuccess(contestId, result) {
		this._submitted.add(String(contestId));
		const agentName = this.getAgentName();
		const confirmation = readEntryConfirmation(result);
		const payment = result?.payment || null;

		// Push to the in-world screens immediately (optimistic), then the next poll
		// reconciles it with Omniology's authoritative feed.
		try {
			this.onSubmitted({ entryId: confirmation.entryId, agent: agentName, payment });
		} catch (err) {
			log.warn('[entry-desk] onSubmitted handler threw:', err?.message);
		}

		this._celebrate();
		this._renderReceipt(confirmation, payment, !!result?.free);
		this._scheduleHide(11000);
	}

	// ── compose UI (default buildEntry) ─────────────────────────────────────────
	_composeDefault() {
		return new Promise((resolve) => {
			const root = this.modalRoot;
			root.replaceChildren();
			root.hidden = false;

			let settled = false;
			const finish = (val) => {
				if (settled) return; settled = true;
				root.classList.remove('ed-show');
				window.removeEventListener('keydown', onEsc, true);
				setTimeout(() => { root.hidden = true; root.replaceChildren(); }, 200);
				resolve(val);
			};
			const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
			window.addEventListener('keydown', onEsc, true);

			const card = el('div', { class: 'ed-card' });
			root.appendChild(card);
			root.onclick = (e) => { if (e.target === root) finish(null); };

			const contestId = this.getContestId();
			const agentId = this.getAgentId();
			const mode = entryFeeMode();

			const head = el('div', { class: 'ed-card-head' }, [
				el('div', {}, [
					el('div', { class: 'ed-card-title', text: 'Submit your entry' }),
					el('div', { class: 'ed-card-meta', text: contestId ? `Round contest · ${mode === 'free' ? 'free entry' : 'pays an entry fee in USDC'}` : 'No live contest' }),
				]),
				el('button', { class: 'ed-x', type: 'button', 'aria-label': 'Close', text: '✕', onclick: () => finish(null) }),
			]);
			card.appendChild(head);

			// Designed empty/blocked state: a paid round with no paying agent connected.
			if (mode !== 'free' && !agentId) {
				card.appendChild(el('div', { class: 'ed-empty', html: 'Entries settle from <b>your agent’s Solana wallet</b>. Connect or create a paying agent, then come back to the desk to enter.' }));
				card.appendChild(el('div', { class: 'ed-actions' }, [
					el('button', { class: 'ed-btn', type: 'button', text: 'Close', onclick: () => finish(null) }),
				]));
				requestAnimationFrame(() => root.classList.add('ed-show'));
				return;
			}

			const form = el('form', { class: 'ed-form', novalidate: 'novalidate' });
			const controls = new Map();
			for (const f of ENTRY_FIELDS) {
				const id = `ed-f-${f.key}`;
				const counter = f.max ? el('span', { class: 'ed-count', text: `0/${f.max}` }) : null;
				const top = el('div', { class: 'ed-field-top' }, [
					el('label', { class: 'ed-label', for: id, html: `${escHtml(f.label)}${f.required ? '' : ' <span class="ed-req">(optional)</span>'}` }),
					counter,
				]);
				const input = f.type === 'textarea'
					? el('textarea', { class: 'ed-textarea', id, placeholder: f.placeholder || '', 'aria-required': String(!!f.required), rows: '3' })
					: el('input', { class: 'ed-input', id, type: f.type === 'url' ? 'url' : 'text', placeholder: f.placeholder || '', 'aria-required': String(!!f.required), inputmode: f.type === 'url' ? 'url' : 'text' });
				const err = el('div', { class: 'ed-error', id: `${id}-err`, role: 'alert' });
				const field = el('div', { class: 'ed-field' }, [
					top, input,
					f.hint ? el('div', { class: 'ed-hint', text: f.hint }) : null,
					err,
				]);
				const sync = () => {
					if (counter) {
						const n = input.value.length;
						counter.textContent = `${n}/${f.max}`;
						counter.classList.toggle('ed-over', n > f.max);
					}
				};
				input.addEventListener('input', () => { sync(); field.classList.remove('ed-invalid'); err.textContent = ''; });
				controls.set(f.key, { input, err, field });
				form.appendChild(field);
			}
			card.appendChild(form);

			const formError = el('div', { class: 'ed-form-error', role: 'alert' });
			card.appendChild(formError);

			const submitBtn = el('button', { class: 'ed-btn ed-btn-primary', type: 'submit', text: mode === 'free' ? 'Submit entry' : 'Review & pay' });
			const actions = el('div', { class: 'ed-actions' }, [
				el('button', { class: 'ed-btn', type: 'button', text: 'Cancel', onclick: () => finish(null) }),
				submitBtn,
			]);
			card.appendChild(actions);

			form.addEventListener('submit', (e) => {
				e.preventDefault();
				const values = {};
				for (const [key, c] of controls) values[key] = c.input.value;
				const result = validateEntry(values);
				if (!result.ok) {
					formError.textContent = 'Please fix the highlighted fields before submitting.';
					let firstBad = null;
					for (const [key, c] of controls) {
						const msg = result.errors[key];
						c.field.classList.toggle('ed-invalid', !!msg);
						c.err.textContent = msg || '';
						if (msg && !firstBad) firstBad = c.input;
					}
					firstBad?.focus();
					return;
				}
				finish(normalizeEntry(values));
			});

			requestAnimationFrame(() => {
				root.classList.add('ed-show');
				controls.get(ENTRY_FIELDS[0].key)?.input.focus();
			});
		});
	}

	// ── payment panel rendering ─────────────────────────────────────────────────
	_renderPanel({ stage, active = false, sub = null, explorer = null, free = false }) {
		if (free) {
			this.panel.innerHTML =
				'<div class="ed-ph"><span class="ed-pt">Submitting to <b>Omniology</b></span><span class="ed-fee">Free entry</span></div>' +
				'<div class="ed-sub">Sending your entry…</div>';
			return;
		}
		const activeIdx = STAGES.findIndex((s) => s.id === stage);
		const steps = STAGES.map((s, i) => {
			const cls = i < activeIdx ? 'is-done' : (i === activeIdx && active ? 'is-active' : (i === activeIdx ? 'is-done' : ''));
			return `<div class="ed-step ${cls}"><span class="ed-dot"></span>${escHtml(s.label)}</div>`;
		}).join('');
		const feeTxt = this._amount != null ? escHtml(fmtUsdc(this._amount)) : '— USDC';
		let subHtml = '';
		if (sub) {
			subHtml = `<div class="ed-sub">${escHtml(sub)}`;
			if (explorer) subHtml += ` · <a href="${escHtml(explorer)}" target="_blank" rel="noopener">Solscan ↗</a>`;
			subHtml += '</div>';
		}
		this.panel.innerHTML =
			`<div class="ed-ph"><span class="ed-pt">Entering <b>Omniology</b> contest</span><span class="ed-fee">${feeTxt}</span></div>` +
			`<div class="ed-steps">${steps}</div>${subHtml}`;
	}

	_renderReceipt(confirmation, payment, free) {
		// Stepper fully done.
		if (!free) {
			this._renderPanel({ stage: 'done', active: false, sub: 'Entry accepted' });
			this.panel.querySelectorAll('.ed-step').forEach((node) => { node.classList.remove('is-active'); node.classList.add('is-done'); });
		} else {
			this.panel.innerHTML =
				'<div class="ed-ph"><span class="ed-pt">Submitted to <b>Omniology</b></span><span class="ed-fee">Free entry</span></div>';
		}

		const rows = [];
		const pos = confirmation.position;
		const round = confirmation.round;
		if (round != null) rows.push(['Round', String(round)]);
		if (pos != null) rows.push(['Position', `#${pos}`]);
		if (confirmation.entryId) rows.push(['Entry', shortAddr(confirmation.entryId)]);

		const receipt = el('div', { class: 'ed-receipt' });
		const head = el('div', { class: 'ed-sub', html: '<b>You’re in.</b> Your entry just hit the live ticker.' });
		receipt.appendChild(head);
		for (const [k, val] of rows) {
			receipt.appendChild(el('div', { class: 'ed-rrow' }, [el('span', { text: k }), el('span', { class: 'ed-v', text: val })]));
		}
		if (payment) {
			const amount = payment.amount ? fmtUsdc(payment.amount) : '— USDC';
			receipt.appendChild(el('div', { class: 'ed-rrow' }, [el('span', { text: 'Paid · network' }), el('span', { class: 'ed-v', text: `${amount} · Solana` })]));
			const tx = payment.tx;
			if (tx) {
				const link = el('a', { href: payment.explorer || `https://solscan.io/tx/${tx}`, target: '_blank', rel: 'noopener', text: `${String(tx).slice(0, 8)}…${String(tx).slice(-6)} ↗` });
				receipt.appendChild(el('div', { class: 'ed-rrow' }, [el('span', { text: 'Transaction' }), el('span', { class: 'ed-v' }, [link])]));
			}
		}
		this.panel.appendChild(receipt);
		this.panel.classList.add('ed-show');
	}

	// Designed, honest error. The charging note is derived from the failure code so
	// we never imply funds were untouched after settlement was uncertain.
	_renderError(err) {
		const code = err?.code || '';
		const movedNoFunds = ['agent_required', 'endpoint_unreachable', 'invalid_challenge', 'blocked_url', 'no_solana_accept', 'missing_fee_payer', 'payment_required', 'submit_rejected', 'unsupported_asset'].includes(code);
		const uncertain = code === 'settle_uncertain';

		this.panel.classList.add('ed-show');
		// Mark the current stepper stage as errored if a stepper is showing.
		const steps = this.panel.querySelectorAll('.ed-step');
		if (steps.length) {
			let lastActive = -1;
			steps.forEach((n, i) => { if (n.classList.contains('is-active')) lastActive = i; });
			const idx = lastActive >= 0 ? lastActive : 0;
			steps.forEach((n, i) => { n.classList.remove('is-active'); if (i === idx) n.classList.add('is-err'); });
		} else {
			this.panel.innerHTML = '<div class="ed-ph"><span class="ed-pt">Entry not submitted</span></div>';
		}

		const note = uncertain
			? '<span class="ed-warn">⚠ Payment status couldn’t be confirmed.</span> Check your agent’s activity before retrying so you don’t pay twice.'
			: movedNoFunds
				? 'No payment was made — your wallet is unchanged. You can try again.'
				: 'Something went wrong. No entry was recorded; try again in a moment.';
		const msg = el('div', { class: 'ed-err-msg', html: `${escHtml(err?.message || 'Submission failed.')}<br>${note}` });
		this.panel.appendChild(msg);
		this._scheduleHide(uncertain ? 14000 : 8000);
	}

	_scheduleHide(ms) {
		clearTimeout(this._hideTimer);
		this._hideTimer = setTimeout(() => { this.panel.classList.remove('ed-show'); }, ms);
	}

	// ── celebration (sound + light pulse, reduced-motion gated) ──────────────────
	_celebrate() {
		this._celebrateT = CELEBRATE_MS_S;
		if (!prefersReducedMotion()) this._chime();
	}

	_chime() {
		try {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			if (!Ctx) return;
			const ctx = this._audio || (this._audio = new Ctx());
			if (ctx.state === 'suspended') ctx.resume().catch(() => {});
			const now = ctx.currentTime;
			const notes = [523.25, 783.99]; // C5 → G5, a soft confirming two-note
			notes.forEach((freq, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = 'sine';
				osc.frequency.value = freq;
				const t = now + i * 0.11;
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
				osc.connect(gain).connect(ctx.destination);
				osc.start(t);
				osc.stop(t + 0.34);
			});
		} catch (err) {
			log.warn('[entry-desk] chime failed:', err?.message);
		}
	}

	_toast(msg, tone) {
		if (this.ui?.toast) this.ui.toast(msg, tone);
		else log.info(`[entry-desk] ${msg}`);
	}

	dispose() {
		window.removeEventListener('keydown', this._onKey);
		clearTimeout(this._hideTimer);
		if (this.group) {
			this.scene.remove(this.group);
			this.group.traverse((n) => {
				if (n.isMesh) {
					n.geometry?.dispose?.();
					const mats = Array.isArray(n.material) ? n.material : [n.material];
					mats.forEach((m) => { m?.map?.dispose?.(); m?.dispose?.(); });
				}
			});
			this.group = null;
		}
		this._screenTex?.dispose?.();
		this.root?.remove();
		if (this._audio && this._audio.state !== 'closed') this._audio.close().catch(() => {});
	}
}
