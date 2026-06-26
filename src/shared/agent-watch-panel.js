// agent-watch-panel — live "remote desktop + webcam" view for any agent.
//
// Two surfaces in one component:
//   Screen   — left/main pane. When the agent has a Playwright process pushing
//              frames via POST /api/agent/screen-push, renders them at the raw
//              resolution. When no frames are coming, paints a "desktop" canvas
//              from real agent-actions rows: task log, recent actions, live
//              status indicator — so the screen is never blank.
//   Webcam   — right/inset pane. The agent's 3D GLB avatar rendered into an
//              offscreen Three.js canvas, zoomed on the face, piped into a
//              <video> element via captureStream(). Webcam bezel overlay.
//
// Usage (same pattern as mountStagePanel / mountLaborPanel):
//   const handle = await mountWatchPanel({ agentId, agentName, avatarUrl, isOwner, container });
//   // later:
//   handle?.destroy();
//
// The panel is entirely self-contained: it manages its own SSE connection,
// Three.js renderer, timers, and styles. Disposing cleans up everything.

import {
	PerspectiveCamera, WebGLRenderer, Scene,
	AmbientLight, DirectionalLight, Box3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationManager } from '../animation-manager.js';

const STREAM_URL = (id) => `/api/agent-screen-stream?agentId=${encodeURIComponent(id)}`;
const ACTIONS_URL = (id) => `/api/agent-actions?agent_id=${encodeURIComponent(id)}&limit=20`;

// Canvas dimensions for the activity screen (no frames mode).
const CW = 1280, CH = 720;

const STYLE_ID = 'tws-watch-panel-styles';

function injectStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const s = document.createElement('style');
	s.id = STYLE_ID;
	s.textContent = `
.wp-root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	font-family: var(--font-sans, 'Inter', system-ui, sans-serif);
}
.wp-stage {
	display: grid;
	grid-template-columns: 1fr 240px;
	gap: 12px;
	align-items: start;
}
@media (max-width: 700px) {
	.wp-stage { grid-template-columns: 1fr; }
}

/* ── Screen pane ───────────────────────────────────────────── */
.wp-screen-wrap {
	position: relative;
	width: 100%;
	aspect-ratio: 16/9;
	background: #09090c;
	border-radius: 10px;
	overflow: hidden;
	border: 1px solid rgba(255,255,255,0.07);
	box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6);
}
.wp-screen-bezel {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 3;
	border-radius: 10px;
	box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.06),
	            inset 0 1px 0 rgba(255,255,255,0.04);
}
.wp-screen-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	object-fit: contain;
	border-radius: 9px;
}
.wp-screen-badge {
	position: absolute;
	top: 10px;
	left: 12px;
	z-index: 4;
	display: flex;
	align-items: center;
	gap: 6px;
	background: rgba(0,0,0,0.55);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	border: 1px solid rgba(255,255,255,0.08);
	border-radius: 20px;
	padding: 4px 10px 4px 8px;
	font-size: 11px;
	font-weight: 700;
	color: rgba(255,255,255,0.75);
	letter-spacing: 0.04em;
	text-transform: uppercase;
}
.wp-screen-badge-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #5fd08a;
	animation: wp-pulse 2s ease-in-out infinite;
}
.wp-screen-badge-dot.offline { background: #666; animation: none; }
@keyframes wp-pulse {
	0%,100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.4; transform: scale(0.7); }
}
.wp-screen-expand {
	position: absolute;
	bottom: 10px;
	right: 12px;
	z-index: 4;
	background: rgba(0,0,0,0.5);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 6px;
	color: rgba(255,255,255,0.6);
	font-size: 12px;
	padding: 4px 8px;
	cursor: pointer;
	transition: background 0.15s, color 0.15s;
}
.wp-screen-expand:hover { background: rgba(255,255,255,0.12); color: #fff; }

/* ── Webcam pane ────────────────────────────────────────────── */
.wp-cam-wrap {
	position: relative;
	width: 100%;
	aspect-ratio: 3/4;
	background: #0d0d10;
	border-radius: 10px;
	overflow: hidden;
	border: 1px solid rgba(255,255,255,0.07);
	box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.5);
}
.wp-cam-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	object-fit: cover;
}
.wp-cam-video {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	object-fit: cover;
}
.wp-cam-bezel {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 2;
	border-radius: 10px;
	/* Webcam vignette + scanlines effect */
	background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%);
	box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.05);
}
.wp-cam-bezel::after {
	content: '';
	position: absolute;
	inset: 0;
	background: repeating-linear-gradient(
		0deg,
		transparent,
		transparent 2px,
		rgba(0,0,0,0.04) 2px,
		rgba(0,0,0,0.04) 4px
	);
	pointer-events: none;
}
.wp-cam-label {
	position: absolute;
	bottom: 8px;
	left: 10px;
	z-index: 3;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: rgba(255,255,255,0.5);
}
.wp-cam-corner {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 3;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: rgba(95,208,138,0.8);
	box-shadow: 0 0 6px rgba(95,208,138,0.5);
}

/* ── Activity log ───────────────────────────────────────────── */
.wp-log {
	width: 100%;
	background: rgba(255,255,255,0.02);
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 8px;
	overflow: hidden;
}
.wp-log-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 14px;
	border-bottom: 1px solid rgba(255,255,255,0.05);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	color: rgba(255,255,255,0.4);
}
.wp-log-list {
	max-height: 180px;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.wp-log-row {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 7px 14px;
	border-bottom: 1px solid rgba(255,255,255,0.03);
	transition: background 0.1s;
}
.wp-log-row:last-child { border-bottom: none; }
.wp-log-row:hover { background: rgba(255,255,255,0.03); }
.wp-log-type {
	flex-shrink: 0;
	font-size: 9px;
	font-weight: 800;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: rgba(255,255,255,0.28);
	padding-top: 2px;
	min-width: 56px;
}
.wp-log-summary {
	flex: 1;
	font-size: 12px;
	color: rgba(255,255,255,0.7);
	line-height: 1.4;
}
.wp-log-time {
	flex-shrink: 0;
	font-size: 11px;
	color: rgba(255,255,255,0.25);
	padding-top: 2px;
}
.wp-log-empty {
	padding: 18px 14px;
	font-size: 12px;
	color: rgba(255,255,255,0.3);
	text-align: center;
}
`;
	document.head.appendChild(s);
}

// ── helpers ───────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function relTime(ts) {
	const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
	if (s < 5)  return 'now';
	if (s < 60) return `${s}s`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.round(m / 60)}h`;
}

// ── activity desktop canvas (no-frame fallback) ───────────────────────────────

function paintActivityCanvas(ctx, actions, status, agentName, t) {
	const W = CW, H = CH;
	const up = '#5fd08a', dim = 'rgba(255,255,255,0.35)', faint = 'rgba(255,255,255,0.15)';
	const text = '#f0f0f4', bg0 = '#0a0a0e', bg1 = '#101014';

	// Background
	const bg = ctx.createLinearGradient(0, 0, 0, H);
	bg.addColorStop(0, bg1);
	bg.addColorStop(1, bg0);
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, H);

	// Taskbar
	ctx.fillStyle = 'rgba(255,255,255,0.04)';
	ctx.fillRect(0, 0, W, 52);
	ctx.strokeStyle = 'rgba(255,255,255,0.06)';
	ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(0, 52); ctx.lineTo(W, 52); ctx.stroke();

	// Taskbar: agent name + status dot
	const pulse = 0.5 + 0.5 * Math.sin(t * 3);
	ctx.beginPath();
	ctx.arc(32, 26, 7, 0, Math.PI * 2);
	ctx.fillStyle = status === 'live'
		? `rgba(95,208,138,${0.5 + pulse * 0.5})`
		: 'rgba(120,120,128,0.6)';
	ctx.fill();

	ctx.font = '700 18px Inter, system-ui, sans-serif';
	ctx.fillStyle = text;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	const displayName = (agentName || 'Agent').slice(0, 28);
	ctx.fillText(displayName, 54, 26);

	ctx.font = '500 15px Inter, system-ui, sans-serif';
	ctx.fillStyle = status === 'live' ? up : dim;
	const statusLabel = status === 'live' ? '● LIVE' : '○ IDLE';
	ctx.fillText(statusLabel, 54 + ctx.measureText(displayName + '  ').width, 26);

	// Taskbar right: clock
	const now = new Date();
	const clock = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
	ctx.font = '600 16px Inter, system-ui, monospace';
	ctx.fillStyle = dim;
	ctx.textAlign = 'right';
	ctx.fillText(clock, W - 24, 26);
	ctx.textAlign = 'left';

	// Terminal window
	const pad = 32;
	const winX = pad, winY = 72, winW = W - pad * 2, winH = H - 72 - pad;
	const r = 10;

	// Window shadow
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.7)';
	ctx.shadowBlur = 32;
	ctx.shadowOffsetY = 8;
	ctx.fillStyle = 'rgba(0,0,0,0)';
	ctx.beginPath();
	ctx.roundRect?.(winX, winY, winW, winH, r) || fallbackRect(ctx, winX, winY, winW, winH, r);
	ctx.fill();
	ctx.restore();

	// Window background
	ctx.fillStyle = '#0d0d11';
	ctx.beginPath();
	ctx.roundRect?.(winX, winY, winW, winH, r) || fallbackRect(ctx, winX, winY, winW, winH, r);
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.06)';
	ctx.lineWidth = 1;
	ctx.stroke();

	// Window titlebar
	const tbH = 38;
	ctx.fillStyle = 'rgba(255,255,255,0.035)';
	ctx.beginPath();
	ctx.roundRect?.(winX, winY, winW, tbH, [r, r, 0, 0]) || fallbackRect(ctx, winX, winY, winW, tbH, 0);
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.05)';
	ctx.beginPath(); ctx.moveTo(winX, winY + tbH); ctx.lineTo(winX + winW, winY + tbH); ctx.stroke();

	// Traffic lights
	const dots = ['#ff5f57', '#febc2e', '#28c840'];
	dots.forEach((c, i) => {
		ctx.beginPath();
		ctx.arc(winX + 18 + i * 20, winY + tbH / 2, 6, 0, Math.PI * 2);
		ctx.fillStyle = c;
		ctx.fill();
	});

	// Window title
	ctx.font = '600 14px Inter, system-ui, sans-serif';
	ctx.fillStyle = dim;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(`${displayName} — activity log`, winX + winW / 2, winY + tbH / 2);
	ctx.textAlign = 'left';

	// Terminal content
	const lineH = 36;
	const contentX = winX + 24;
	let lineY = winY + tbH + 28;
	const maxLines = Math.floor((winH - tbH - 56) / lineH);

	if (!actions.length) {
		ctx.font = '500 16px "Courier New", monospace';
		ctx.fillStyle = faint;
		ctx.textBaseline = 'alphabetic';
		ctx.fillText('> Waiting for agent activity…', contentX, lineY);
		// blinking cursor
		if (Math.sin(t * 4) > 0) {
			const cw = ctx.measureText('> Waiting for agent activity…').width;
			ctx.fillStyle = faint;
			ctx.fillRect(contentX + cw + 4, lineY - 16, 10, 18);
		}
	} else {
		const display = actions.slice(0, maxLines);
		display.forEach((a, i) => {
			const isLatest = i === 0;
			ctx.font = `${isLatest ? '700' : '400'} 15px "Courier New", monospace`;
			ctx.fillStyle = isLatest ? text : faint;
			ctx.textBaseline = 'alphabetic';

			// Prompt prefix
			const prefix = isLatest
				? `  [${relTime(a.ts)}]  `
				: `  [${relTime(a.ts)}]  `;
			ctx.fillStyle = isLatest ? up : 'rgba(255,255,255,0.2)';
			ctx.font = '600 13px "Courier New", monospace';
			ctx.fillText(prefix, contentX, lineY + i * lineH);
			const prefixW = ctx.measureText(prefix).width;

			// Summary
			ctx.fillStyle = isLatest ? text : dim;
			ctx.font = `${isLatest ? '600' : '400'} 14px "Courier New", monospace`;
			const summary = (a.summary || a.type || 'action').slice(0, 90);
			ctx.fillText(summary, contentX + prefixW, lineY + i * lineH);

			// Latest line: blinking cursor
			if (isLatest && Math.sin(t * 4) > 0) {
				const tw = prefixW + ctx.measureText(summary).width;
				ctx.fillStyle = up;
				ctx.fillRect(contentX + tw + 4, lineY + i * lineH - 14, 8, 16);
			}
		});
	}

	// Status bar at bottom of window
	const sbY = winY + winH - 28;
	ctx.fillStyle = 'rgba(95,208,138,0.08)';
	ctx.fillRect(winX + 1, sbY, winW - 2, 27);
	ctx.strokeStyle = 'rgba(255,255,255,0.05)';
	ctx.beginPath(); ctx.moveTo(winX, sbY); ctx.lineTo(winX + winW, sbY); ctx.stroke();
	ctx.font = '600 12px Inter, system-ui, sans-serif';
	ctx.fillStyle = 'rgba(95,208,138,0.7)';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		`three.ws agent · ${actions.length ? actions.length + ' actions' : 'idle'}`,
		contentX,
		sbY + 14,
	);
	ctx.textAlign = 'right';
	ctx.fillStyle = faint;
	ctx.fillText('powered by three.ws', winX + winW - 12, sbY + 14);
	ctx.textAlign = 'left';
}

function fallbackRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// ── WatchPanel class ──────────────────────────────────────────────────────────

class WatchPanel {
	constructor(el, { agentId, agentName, avatarUrl, isOwner }) {
		this.el = el;
		this.agentId = agentId;
		this.agentName = agentName;
		this.avatarUrl = avatarUrl || '/avatars/mannequin.glb';
		this.isOwner = isOwner;

		this._es = null;
		this._destroyed = false;
		this._actions = [];
		this._lastFrame = null;
		this._streamStatus = 'connecting'; // connecting | live | idle
		this._t = 0;
		this._rafId = null;
		this._webcamRafId = null;
		this._webcamRenderer = null;
		this._webcamScene = null;
		this._webcamCamera = null;
		this._webcamMixer = null;
		this._webcamManager = null;

		this._buildDOM();
	}

	_buildDOM() {
		this.el.innerHTML = `
<div class="wp-root">
  <div class="wp-stage">
    <div class="wp-screen-wrap" id="wp-sw">
      <canvas class="wp-screen-canvas" id="wp-canvas" width="${CW}" height="${CH}"></canvas>
      <div class="wp-screen-bezel"></div>
      <div class="wp-screen-badge">
        <div class="wp-screen-badge-dot offline" id="wp-dot"></div>
        <span id="wp-badge-label">Connecting…</span>
      </div>
      <button class="wp-screen-expand" id="wp-expand" title="Full screen">⛶</button>
    </div>
    <div class="wp-cam-wrap" id="wp-cw">
      <video class="wp-cam-video" id="wp-video" autoplay muted playsinline></video>
      <canvas class="wp-cam-canvas" id="wp-cam-canvas" style="display:none"></canvas>
      <div class="wp-cam-bezel"></div>
      <div class="wp-cam-label">${esc(this.agentName || 'Agent')}</div>
      <div class="wp-cam-corner"></div>
    </div>
  </div>
  <div class="wp-log">
    <div class="wp-log-head">
      <span>Activity log</span>
      <span id="wp-log-count" style="font-weight:400">—</span>
    </div>
    <div class="wp-log-list" id="wp-log-list">
      <div class="wp-log-empty">Loading activity…</div>
    </div>
  </div>
</div>`;

		this._canvas = this.el.querySelector('#wp-canvas');
		this._ctx    = this._canvas.getContext('2d');
		this._dot    = this.el.querySelector('#wp-dot');
		this._badge  = this.el.querySelector('#wp-badge-label');
		this._video  = this.el.querySelector('#wp-video');
		this._logList = this.el.querySelector('#wp-log-list');
		this._logCount = this.el.querySelector('#wp-log-count');

		// Expand to fullscreen
		this.el.querySelector('#wp-expand').addEventListener('click', () => {
			const wrap = this.el.querySelector('#wp-sw');
			wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.();
		});
	}

	async start() {
		// Connect SSE stream.
		this._connectStream();

		// Boot the avatar webcam.
		await this._bootWebcam();

		// Start the activity canvas render loop.
		this._startCanvasLoop();
	}

	_connectStream() {
		if (this._es) { try { this._es.close(); } catch { /* */ } }
		const es = new EventSource(STREAM_URL(this.agentId));
		this._es = es;

		// Named events from /api/agent-screen-stream
		es.addEventListener('frame', (e) => {
			try {
				const frame = JSON.parse(e.data);
				if (frame.data) this._renderFrame(frame.data);
				if (frame.activity) {
					// Inject into the activity log as a live push
					const logEntry = { ts: frame.ts || Date.now(), type: frame.type || 'activity', summary: frame.activity };
					this._actions = [logEntry, ...this._actions].slice(0, 50);
					this._renderLog();
				}
				this._setStatus('live');
			} catch { /* malformed */ }
		});

		es.addEventListener('log', (e) => {
			try {
				const { entries } = JSON.parse(e.data);
				if (Array.isArray(entries) && entries.length) {
					this._actions = entries.map((en) => ({
						ts: en.ts,
						type: en.type || 'activity',
						summary: en.activity || '',
					}));
					this._renderLog();
				}
			} catch { /* malformed */ }
		});

		es.addEventListener('dark', () => {
			if (this._streamStatus !== 'connecting') this._setStatus('idle');
		});

		es.addEventListener('ping', () => {
			if (this._streamStatus !== 'live') this._setStatus('idle');
		});

		es.onerror = () => {
			this._setStatus('idle');
			// EventSource auto-reconnects.
		};
	}

	_setStatus(s) {
		this._streamStatus = s;
		if (s === 'live') {
			this._dot.classList.remove('offline');
			this._badge.textContent = 'Live';
		} else if (s === 'idle') {
			this._dot.classList.add('offline');
			this._badge.textContent = 'Idle';
		} else {
			this._dot.classList.add('offline');
			this._badge.textContent = 'Connecting…';
		}
	}

	_renderFrame(dataOrB64) {
		if (this._destroyed) return;
		const img = new Image();
		img.onload = () => {
			if (this._destroyed) return;
			this._ctx.drawImage(img, 0, 0, CW, CH);
		};
		// Accept both raw base64 and full data URLs
		img.src = dataOrB64.startsWith('data:') ? dataOrB64 : 'data:image/png;base64,' + dataOrB64;
	}

	_startCanvasLoop() {
		let lastActivity = 0;
		const loop = (ts) => {
			if (this._destroyed) return;
			this._rafId = requestAnimationFrame(loop);
			this._t = ts / 1000;

			// Only repaint the activity canvas when no live frames are flowing.
			if (this._streamStatus !== 'live') {
				this._ctx.clearRect(0, 0, CW, CH);
				paintActivityCanvas(
					this._ctx,
					this._actions,
					this._streamStatus,
					this.agentName,
					this._t,
				);
			}

			// Poll DB for activity if we don't have pushed actions.
			if (!this._actions.length || Date.now() - lastActivity > 5000) {
				if (!this._fetchingActivity) {
					this._fetchingActivity = true;
					lastActivity = Date.now();
					fetch(ACTIONS_URL(this.agentId), { credentials: 'include' })
						.then((r) => r.ok ? r.json() : null)
						.then((d) => {
							if (d?.data?.actions?.length) {
								this._actions = d.data.actions;
								this._renderLog();
							} else if (Array.isArray(d?.actions)) {
								this._actions = d.actions;
								this._renderLog();
							}
						})
						.catch(() => {})
						.finally(() => { this._fetchingActivity = false; });
				}
			}
		};
		this._rafId = requestAnimationFrame(loop);
	}

	_renderLog() {
		const actions = this._actions;
		this._logCount.textContent = actions.length ? `${actions.length} actions` : '—';
		if (!actions.length) {
			this._logList.innerHTML = '<div class="wp-log-empty">No activity yet</div>';
			return;
		}
		this._logList.innerHTML = actions.map((a) => `
<div class="wp-log-row">
  <div class="wp-log-type">${esc(a.type || 'action')}</div>
  <div class="wp-log-summary">${esc(a.summary || a.type || '')}</div>
  <div class="wp-log-time">${relTime(a.ts || Date.now())}</div>
</div>`).join('');
	}

	async _bootWebcam() {
		const wrap = this.el.querySelector('#wp-cw');
		if (!wrap) return;

		try {
			const loader = new GLTFLoader();
			const gltf = await loader.loadAsync(this.avatarUrl);
			const model = cloneSkinnedScene(gltf.scene);

			const webcamScene = new Scene();
			webcamScene.add(new AmbientLight(0xffffff, 0.7));
			const sun = new DirectionalLight(0xffffff, 1.2);
			sun.position.set(1.5, 2.5, 2);
			webcamScene.add(sun);
			const rim = new DirectionalLight(0x8090ff, 0.4);
			rim.position.set(-2, 1, -1);
			webcamScene.add(rim);
			webcamScene.add(model);

			const webcamCamera = new PerspectiveCamera(38, 3 / 4, 0.01, 20);
			const box = new Box3().setFromObject(model);
			const h = box.max.y;
			webcamCamera.position.set(0, h - 0.12, 0.72);
			webcamCamera.lookAt(0, h - 0.18, 0);

			const renderer = new WebGLRenderer({ antialias: true, alpha: false });
			renderer.setClearColor(0x0d0d10, 1);
			renderer.setSize(480, 640);
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			this._webcamRenderer = renderer;
			this._webcamScene = webcamScene;
			this._webcamCamera = webcamCamera;

			// Drive idle
			const mgr = new AnimationManager(model, { loop: true });
			if (gltf.animations?.length) {
				this._webcamMixer = mgr.init(gltf.animations);
				mgr.play('idle');
				this._webcamManager = mgr;
			}

			// Tick loop
			let last = 0;
			const tick = (t) => {
				if (this._destroyed) return;
				this._webcamRafId = requestAnimationFrame(tick);
				const dt = Math.min((t - last) / 1000, 0.1); last = t;
				if (this._webcamMixer) this._webcamMixer.update(dt);
				renderer.render(webcamScene, webcamCamera);
			};
			this._webcamRafId = requestAnimationFrame(tick);

			// Pipe to <video> via captureStream
			const stream = renderer.domElement.captureStream?.(15);
			if (stream && this._video) {
				this._video.srcObject = stream;
				this._video.style.display = 'block';
				await this._video.play().catch(() => {});
			}
		} catch {
			const cw = this.el.querySelector('#wp-cw');
			if (cw) cw.style.display = 'none';
			const stage = this.el.querySelector('.wp-stage');
			if (stage) stage.style.gridTemplateColumns = '1fr';
		}
	}

	async _rebootWebcam() {
		if (this._webcamRafId) cancelAnimationFrame(this._webcamRafId);
		this._webcamRenderer?.dispose?.();
		this._webcamRenderer = null;
		this._webcamScene = null;
		this._webcamCamera = null;
		this._webcamMixer = null;
		this._webcamManager = null;
		await this._bootWebcam();
	}

	destroy() {
		this._destroyed = true;
		if (this._rafId) cancelAnimationFrame(this._rafId);
		if (this._webcamRafId) cancelAnimationFrame(this._webcamRafId);
		try { this._es?.close(); } catch { /* */ }
		this._webcamRenderer?.dispose?.();
	}
}

// ── public factory ────────────────────────────────────────────────────────────

/**
 * Mount the watch panel into `container`.
 *
 * @param {{ agentId:string, agentName?:string, avatarUrl?:string, isOwner?:boolean,
 *           container:HTMLElement, position?:'append'|'prepend' }} opts
 * @returns {Promise<{destroy():void}|null>}
 */
export async function mountWatchPanel({ agentId, agentName, avatarUrl, isOwner = false, container, position = 'append' } = {}) {
	if (!agentId || !container) return null;

	injectStyles();

	const root = document.createElement('div');
	root.className = 'watch-panel-root';
	if (position === 'prepend') container.prepend(root);
	else container.append(root);

	const panel = new WatchPanel(root, { agentId, agentName, avatarUrl, isOwner });
	await panel.start();

	return { destroy: () => { panel.destroy(); root.remove(); } };
}
