// /agent-screen — live agent screen viewer.
//
// URL: /agent-screen?agentId=<uuid>
//
// Two surfaces, one SSE stream:
//   Left (64%)  — "Screen": renders the agent's latest screenshot frames onto
//                 a canvas. Scales to fit, letterboxed. Fullscreen button for
//                 focus mode. Shows a pulsing "waiting" overlay while dark.
//
//   Right (36%) — "Webcam": an offscreen Three.js renderer pointed at the
//                 agent's avatar head → captureStream() → <video> with a
//                 camera-feed bezel.  Gives the agent presence — you're not
//                 just watching a screen, you're watching someone work.
//
//   Bottom-right — Activity log: scrolling list of what the agent narrated
//                  with each push.

import {
	PerspectiveCamera,
	WebGLRenderer,
	Scene,
	AmbientLight,
	DirectionalLight,
	Vector3,
	Box3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationManager } from './animation-manager.js';
import { glbCanonicalize } from './glb-canonicalize.js';
import { createAgentScreenClient } from './shared/agent-screen-client.js';
import { agentAvatarGlb } from './shared/agent-3d.js';

const params = new URLSearchParams(location.search);
const agentId = params.get('agentId') || '';

const noAgentEl = document.getElementById('asc-no-agent');
const mainEl = document.getElementById('asc-main');
const agentNameEl = document.getElementById('asc-agent-name');
const liveBadgeEl = document.getElementById('asc-live-badge');
const badgeTextEl = document.getElementById('asc-badge-text');
const backEl = document.getElementById('asc-back');
const agentLinkEl = document.getElementById('asc-agent-link');
const fsBtn = document.getElementById('asc-fullscreen-btn');

if (!agentId) {
	// noAgentEl already visible from HTML
} else {
	noAgentEl.style.display = 'none';
	boot(agentId);
}

async function boot(id) {
	// Build the split-view DOM
	mainEl.innerHTML = `
		<div class="asc-screen-panel" id="asc-screen-panel">
			<div class="asc-screen-label">Screen</div>
			<div class="asc-screen-wrap">
				<canvas id="asc-screen-canvas"></canvas>
				<div class="asc-screen-overlay" id="asc-screen-overlay">
					<div class="pulse-ring"></div>
					<p>Waiting for agent…</p>
					<small>The agent will appear here once it starts broadcasting</small>
				</div>
			</div>
		</div>
		<div class="asc-right-panel">
			<div class="asc-webcam-section">
				<div class="asc-webcam-label">Avatar Cam</div>
				<div class="asc-webcam-wrap">
					<div class="asc-webcam-bezel" id="asc-webcam-bezel">
						<div class="asc-webcam-idle" id="asc-webcam-idle">Loading avatar…</div>
						<div class="asc-webcam-badge" id="asc-webcam-badge" style="display:none">
							<span class="cam-dot"></span>
							<span id="asc-webcam-name">—</span>
						</div>
					</div>
				</div>
			</div>
			<div class="asc-log-section">
				<div class="asc-log-label">Activity Log</div>
				<div id="asc-log">
					<div class="asc-log-empty" id="asc-log-empty">No activity yet</div>
				</div>
			</div>
			<div class="asc-activity-bar">
				<span class="asc-activity-icon">⚡</span>
				<span id="asc-current-activity">Waiting for agent…</span>
			</div>
		</div>
	`;

	const screenCanvas = document.getElementById('asc-screen-canvas');
	const screenOverlay = document.getElementById('asc-screen-overlay');
	const screenCtx = screenCanvas.getContext('2d');
	const logEl = document.getElementById('asc-log');
	const logEmpty = document.getElementById('asc-log-empty');
	const currentActivity = document.getElementById('asc-current-activity');
	const webcamBezel = document.getElementById('asc-webcam-bezel');
	const webcamIdle = document.getElementById('asc-webcam-idle');
	const webcamBadge = document.getElementById('asc-webcam-badge');
	const webcamName = document.getElementById('asc-webcam-name');

	// ── resolve agent metadata ─────────────────────────────────────────────
	let agentName = 'Agent';
	let avatarGlbUrl = null;
	try {
		const res = await fetch(`/api/agents/${encodeURIComponent(id)}`);
		if (res.ok) {
			const j = await res.json();
			const agent = j.agent || j;
			agentName = agent.name || 'Agent';
			agentNameEl.textContent = agentName;
			document.title = `${agentName} · Agent Screen · three.ws`;
			webcamName.textContent = agentName;
			backEl.href = `/agents/${id}`;
			agentLinkEl.href = `/agents/${id}`;
			agentLinkEl.textContent = `View ${agentName} →`;
			try {
				avatarGlbUrl = await agentAvatarGlb(agent);
			} catch { /* fall through to default */ }
		}
	} catch { /* non-fatal */ }

	// ── avatar webcam ──────────────────────────────────────────────────────
	const webcamRenderer = new WebGLRenderer({ antialias: true, alpha: true });
	webcamRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	webcamRenderer.setClearColor(0x0a0d1a, 1);

	const webcamScene = new Scene();
	webcamScene.add(new AmbientLight(0xffffff, 0.7));
	const sun = new DirectionalLight(0xffffff, 1.2);
	sun.position.set(1.5, 2.5, 2);
	webcamScene.add(sun);
	const rim = new DirectionalLight(0x8090ff, 0.4);
	rim.position.set(-2, 1, -1);
	webcamScene.add(rim);

	const webcamCamera = new PerspectiveCamera(38, 4 / 3, 0.01, 20);
	webcamCamera.position.set(0, 1.62, 0.9);
	webcamCamera.lookAt(0, 1.55, 0);

	let webcamMixer = null;
	let webcamAnimManager = null;
	let webcamAvatar = null;
	let webcamRafId = null;
	let webcamStream = null;

	async function mountAvatarWebcam(glbUrl) {
		try {
			const loader = new GLTFLoader();
			const gltf = await loader.loadAsync(glbUrl || '/avatars/default.glb');
			const model = cloneSkinnedScene(gltf.scene);
			glbCanonicalize(model);

			webcamScene.add(model);
			webcamAvatar = model;

			// Frame avatar in the camera: center on head
			const box = new Box3().setFromObject(model);
			const h = box.max.y;
			webcamCamera.position.set(0, h - 0.12, 0.72);
			webcamCamera.lookAt(0, h - 0.18, 0);

			// Drive idle animation
			webcamAnimManager = new AnimationManager(model, { loop: true });
			if (gltf.animations?.length) {
				webcamMixer = webcamAnimManager.init(gltf.animations);
				webcamAnimManager.play('idle');
			}

			// Size the renderer to match the bezel
			const bw = webcamBezel.clientWidth || 300;
			const bh = Math.round(bw * 3 / 4);
			webcamRenderer.setSize(bw, bh);

			// Inject canvas into the bezel
			const canvas = webcamRenderer.domElement;
			canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px;';
			webcamIdle.style.display = 'none';
			webcamBezel.appendChild(canvas);
			webcamBadge.style.display = 'flex';

			// Start render loop — captureStream feeds the "live" feel
			let last = 0;
			function webcamTick(t) {
				webcamRafId = requestAnimationFrame(webcamTick);
				const dt = Math.min((t - last) / 1000, 0.1);
				last = t;
				if (webcamMixer) webcamMixer.update(dt);
				webcamRenderer.render(webcamScene, webcamCamera);
			}
			webcamRafId = requestAnimationFrame(webcamTick);
		} catch (err) {
			console.warn('[agent-screen] avatar webcam load failed:', err);
			webcamIdle.textContent = 'Avatar unavailable';
		}
	}

	if (avatarGlbUrl) {
		mountAvatarWebcam(avatarGlbUrl);
	} else {
		mountAvatarWebcam('/avatars/default.glb');
	}

	// ── screen canvas rendering ────────────────────────────────────────────
	let lastFrameImg = null;

	function renderFrame(frame) {
		if (!frame?.data) return;
		const img = new Image();
		img.onload = () => {
			screenCanvas.width = img.naturalWidth || 1280;
			screenCanvas.height = img.naturalHeight || 720;
			screenCtx.drawImage(img, 0, 0);
			lastFrameImg = img;
		};
		img.src = frame.data;
	}

	function setLive() {
		liveBadgeEl.classList.remove('dark');
		badgeTextEl.textContent = 'LIVE';
		screenOverlay.style.display = 'none';
	}

	function setDark() {
		liveBadgeEl.classList.add('dark');
		badgeTextEl.textContent = 'OFFLINE';
		screenOverlay.style.display = 'flex';
		screenOverlay.innerHTML = `
			<div class="pulse-ring" style="border-color:rgba(255,255,255,0.15)"></div>
			<p>Agent is offline</p>
			<small>Stream will resume when the agent reconnects</small>
		`;
		currentActivity.textContent = 'Agent offline';
	}

	// ── activity log ──────────────────────────────────────────────────────
	const MAX_LOG = 80;
	let logCount = 0;

	function fmtTime(ts) {
		const d = new Date(ts);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function addLogEntry({ ts, activity, type }) {
		logEmpty?.remove();
		const entry = document.createElement('div');
		entry.className = 'asc-log-entry';
		const typeLabel = type || 'activity';
		entry.innerHTML = `
			<span class="asc-log-time">${fmtTime(ts || Date.now())}</span>
			<span class="asc-log-type ${typeLabel}">${typeLabel}</span>
			<span class="asc-log-text">${esc(activity || '')}</span>
		`;
		logEl.prepend(entry);
		logCount++;
		// Trim old entries
		while (logCount > MAX_LOG) {
			logEl.lastElementChild?.remove();
			logCount--;
		}
	}

	// ── SSE client ─────────────────────────────────────────────────────────
	const client = createAgentScreenClient(id, {
		onOpen({ agentName: n }) {
			if (n) { agentNameEl.textContent = n; agentName = n; webcamName.textContent = n; }
			badgeTextEl.textContent = 'Connecting…';
		},
		onFrame(frame) {
			setLive();
			if (frame.data) renderFrame(frame);
			if (frame.activity) {
				currentActivity.textContent = frame.activity;
				addLogEntry(frame);
			}
		},
		onLog(entries) {
			entries.forEach(addLogEntry);
		},
		onDark() { setDark(); },
		onError() {
			badgeTextEl.textContent = 'Reconnecting…';
			liveBadgeEl.classList.add('dark');
		},
	});

	client.connect();

	// ── fullscreen ─────────────────────────────────────────────────────────
	const screenPanel = document.getElementById('asc-screen-panel');
	fsBtn.addEventListener('click', () => {
		if (!document.fullscreenElement) {
			screenPanel.requestFullscreen?.().catch(() => {});
		} else {
			document.exitFullscreen?.().catch(() => {});
		}
	});
	document.addEventListener('fullscreenchange', () => {
		fsBtn.textContent = document.fullscreenElement ? '✕ Exit' : '⛶ Fullscreen';
	});

	// Cleanup on unload
	window.addEventListener('beforeunload', () => {
		client.disconnect();
		if (webcamRafId) cancelAnimationFrame(webcamRafId);
		webcamRenderer.dispose();
	});
}

function esc(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
