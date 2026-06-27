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
	Box3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationManager } from './animation-manager.js';
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
	renderSetup();
} else {
	noAgentEl.style.display = 'none';
	boot(agentId);
}

// ── Worker Setup Panel ─────────────────────────────────────────────────────
// Rendered when no agentId is in the URL. Walks through:
//   1. Pick an agent (shows UUIDs)
//   2. Generate an API key (used as AGENT_JWT)
//   3. Copy the exact run command

async function renderSetup() {
	// Update header to reflect setup mode
	document.title = 'Launch Worker · Agent Screen · three.ws';
	document.getElementById('asc-agent-name').textContent = 'Worker Setup';
	document.getElementById('asc-live-badge').style.display = 'none';
	document.getElementById('asc-fullscreen-btn').style.display = 'none';
	document.getElementById('asc-agent-link').style.display = 'none';

	const container = noAgentEl;
	container.className = 'ws-setup';
	container.style.display = 'flex';

	let selectedAgent = null; // { id, name }
	let apiKey = null;        // 'sk_live_...'
	let activeTab = 'local';

	// ── Check auth ─────────────────────────────────────────────────────────
	let agents = [];
	let isSignedIn = false;
	try {
		const r = await fetch('/api/agents', { credentials: 'include' });
		if (r.ok) {
			const j = await r.json();
			agents = j.agents || j.data || [];
			isSignedIn = true;
		} else if (r.status === 401) {
			isSignedIn = false;
		}
	} catch { /* network error — treat as signed-out */ }

	// ── Render ─────────────────────────────────────────────────────────────
	function buildCommand() {
		const id = selectedAgent?.id || '<AGENT_ID>';
		const key = apiKey || '<AGENT_JWT>';
		const url = location.origin;
		if (activeTab === 'local') {
			return [
				`<span class="cmd-comment"># workers/agent-screen-worker/</span>`,
				`<span class="cmd-key">AGENT_ID</span>=<span class="cmd-val">${esc(id)}</span> \\`,
				`<span class="cmd-key">AGENT_JWT</span>=<span class="cmd-val">${esc(key)}</span> \\`,
				`<span class="cmd-key">PUSH_URL</span>=<span class="cmd-val">${esc(url)}/api/agent-screen-push</span> \\`,
				`<span class="cmd-run">npm start</span>`,
			].join('\n');
		}
		if (activeTab === 'docker') {
			return [
				`<span class="cmd-comment"># from workers/agent-screen-worker/</span>`,
				`<span class="cmd-run">docker build</span> -t agent-screen-worker . && \\`,
				`<span class="cmd-run">docker run</span> \\`,
				`  -e <span class="cmd-key">AGENT_ID</span>=<span class="cmd-val">${esc(id)}</span> \\`,
				`  -e <span class="cmd-key">AGENT_JWT</span>=<span class="cmd-val">${esc(key)}</span> \\`,
				`  -e <span class="cmd-key">PUSH_URL</span>=<span class="cmd-val">${esc(url)}/api/agent-screen-push</span> \\`,
				`  agent-screen-worker`,
			].join('\n');
		}
		// browserbase
		return [
			`<span class="cmd-comment"># workers/agent-screen-worker/ — no Docker needed</span>`,
			`<span class="cmd-key">AGENT_ID</span>=<span class="cmd-val">${esc(id)}</span> \\`,
			`<span class="cmd-key">AGENT_JWT</span>=<span class="cmd-val">${esc(key)}</span> \\`,
			`<span class="cmd-key">PUSH_URL</span>=<span class="cmd-val">${esc(url)}/api/agent-screen-push</span> \\`,
			`<span class="cmd-key">BROWSERBASE_API_KEY</span>=<span class="cmd-val">&lt;your-bb-key&gt;</span> \\`,
			`<span class="cmd-key">BROWSERBASE_PROJECT_ID</span>=<span class="cmd-val">&lt;your-bb-project&gt;</span> \\`,
			`<span class="cmd-run">npm start</span>`,
		].join('\n');
	}

	function buildRawCommand() {
		const id = selectedAgent?.id || '';
		const key = apiKey || '';
		const url = location.origin;
		if (activeTab === 'local') {
			return `AGENT_ID=${id} AGENT_JWT=${key} PUSH_URL=${url}/api/agent-screen-push npm start`;
		}
		if (activeTab === 'docker') {
			return `docker build -t agent-screen-worker . && docker run -e AGENT_ID=${id} -e AGENT_JWT=${key} -e PUSH_URL=${url}/api/agent-screen-push agent-screen-worker`;
		}
		return `AGENT_ID=${id} AGENT_JWT=${key} PUSH_URL=${url}/api/agent-screen-push BROWSERBASE_API_KEY=<key> BROWSERBASE_PROJECT_ID=<id> npm start`;
	}

	function agentCardHTML(a) {
		const initials = (a.name || '?').slice(0, 2).toUpperCase();
		const thumbUrl = a.avatar_thumbnail_url || a.avatar_url || '';
		const avatarEl = thumbUrl
			? `<img class="ws-agent-avatar" src="${esc(thumbUrl)}" alt="" loading="lazy">`
			: `<div class="ws-agent-avatar-placeholder">${esc(initials)}</div>`;
		const shortId = (a.id || '').slice(0, 8) + '…';
		return `<button class="ws-agent-card${selectedAgent?.id === a.id ? ' selected' : ''}" data-id="${esc(a.id)}" data-name="${esc(a.name || 'Agent')}">
			${avatarEl}
			<div class="ws-agent-info">
				<div class="ws-agent-name">${esc(a.name || 'Agent')}</div>
				<div class="ws-agent-uuid">${esc(shortId)}</div>
			</div>
		</button>`;
	}

	function render() {
		const step1Done = !!selectedAgent;
		const step2Done = !!apiKey;

		container.innerHTML = `
		<div class="ws-setup-inner">
			<div class="ws-setup-hero">
				<h1>Launch your browser agent</h1>
				<p>Three steps to get a live browser stream running on your agent's screen.</p>
			</div>

			${!isSignedIn ? `
			<div class="ws-not-signed-in">
				<span>⚠</span>
				<span>You need to <a href="/login">sign in</a> to generate an API key and select an agent.</span>
			</div>` : ''}

			<!-- Step 1: Pick agent -->
			<div class="ws-setup-step">
				<div class="ws-setup-step-head">
					<div class="ws-step-num${step1Done ? ' done' : ''}">${step1Done ? '✓' : '1'}</div>
					<div>
						<h3>${step1Done ? `Agent: ${esc(selectedAgent.name)}` : 'Select an agent'}</h3>
						<p>${step1Done ? esc(selectedAgent.id) : 'Choose which agent will broadcast its screen'}</p>
					</div>
					${step1Done ? `<button class="ws-btn ws-btn-ghost" id="ws-change-agent" style="margin-left:auto;font-size:0.75rem;padding:0.3rem 0.6rem;">Change</button>` : ''}
				</div>
				${!step1Done ? `
				<div class="ws-setup-step-body">
					<div class="ws-agent-grid" id="ws-agent-grid">
						${agents.length > 0
							? agents.map(agentCardHTML).join('')
							: `<div class="ws-agent-empty">
								${isSignedIn
									? `No agents yet. <a href="/agents/new">Create one →</a>`
									: `<a href="/login">Sign in</a> to see your agents.`
								}
							</div>`
						}
					</div>
				</div>` : ''}
			</div>

			<!-- Step 2: API key -->
			<div class="ws-setup-step" ${!step1Done ? 'style="opacity:0.45;pointer-events:none"' : ''}>
				<div class="ws-setup-step-head">
					<div class="ws-step-num${step2Done ? ' done' : ''}">${step2Done ? '✓' : '2'}</div>
					<div>
						<h3>Generate an API key</h3>
						<p>Used as <code style="font-size:0.78rem;color:#d4d4d8">AGENT_JWT</code> — authenticates the worker as you</p>
					</div>
				</div>
				<div class="ws-setup-step-body">
					<div class="ws-key-row">
						<div class="ws-key-display${apiKey ? '' : ' placeholder'}" id="ws-key-display">
							${apiKey ? esc(apiKey) : 'Click Generate to create a key'}
						</div>
						${apiKey
							? `<button class="ws-btn ws-btn-copy" id="ws-copy-key">Copy</button>`
							: `<button class="ws-btn ws-btn-primary" id="ws-gen-key" ${!isSignedIn ? 'disabled' : ''}>Generate</button>`
						}
					</div>
					${apiKey
						? `<p class="ws-key-note"><strong>Save this key now.</strong> It won't be shown again. It grants access to your account — treat it like a password.</p>`
						: `<p class="ws-key-note">Creates a new <code style="font-size:0.78rem">agents:write</code>-scoped API key. You can manage keys at <a href="/dashboard-next/developers" style="color:#d4d4d8">Developers →</a></p>`
					}
				</div>
			</div>

			<!-- Step 3: Run command -->
			<div class="ws-setup-step" ${!step1Done ? 'style="opacity:0.45;pointer-events:none"' : ''}>
				<div class="ws-setup-step-head">
					<div class="ws-step-num">${step1Done && step2Done ? '3' : '3'}</div>
					<div>
						<h3>Run the worker</h3>
						<p>Copy and run in your terminal from the <code style="font-size:0.78rem;color:#d4d4d8">workers/agent-screen-worker/</code> directory</p>
					</div>
				</div>
				<div class="ws-setup-step-body">
					<div class="ws-cmd-tabs">
						<button class="ws-cmd-tab${activeTab === 'local' ? ' active' : ''}" data-tab="local">Local (npm)</button>
						<button class="ws-cmd-tab${activeTab === 'docker' ? ' active' : ''}" data-tab="docker">Docker</button>
						<button class="ws-cmd-tab${activeTab === 'bb' ? ' active' : ''}" data-tab="bb">Browserbase</button>
					</div>
					<div class="ws-cmd-block">
						<button class="ws-btn ws-btn-copy ws-cmd-copy" id="ws-copy-cmd">Copy</button>
						<pre id="ws-cmd-pre">${buildCommand()}</pre>
					</div>
					${activeTab === 'bb' ? `<p class="ws-key-note" style="margin-top:0.7rem">Get your Browserbase key + project ID at <a href="https://browserbase.com" target="_blank" rel="noopener" style="color:#d4d4d8">browserbase.com</a> — no Docker needed, the browser runs in their cloud.</p>` : ''}
					${selectedAgent && apiKey ? `
					<div class="ws-status-ok">
						<span>✓</span>
						<span>Ready. Once the worker starts, your stream will appear live below.</span>
					</div>
					<a class="ws-watch-link" href="/agent-screen?agentId=${esc(selectedAgent.id)}">
						Watch live stream →
					</a>` : ''}
				</div>
			</div>
		</div>`;

		// Bind events
		container.querySelectorAll('.ws-agent-card').forEach((card) => {
			card.addEventListener('click', () => {
				selectedAgent = { id: card.dataset.id, name: card.dataset.name };
				render();
			});
		});
		container.querySelector('#ws-change-agent')?.addEventListener('click', () => {
			selectedAgent = null;
			render();
		});
		container.querySelector('#ws-gen-key')?.addEventListener('click', generateKey);
		container.querySelector('#ws-copy-key')?.addEventListener('click', () => copyText(apiKey, 'ws-copy-key'));
		container.querySelector('#ws-copy-cmd')?.addEventListener('click', () => copyText(buildRawCommand(), 'ws-copy-cmd'));
		container.querySelectorAll('.ws-cmd-tab').forEach((tab) => {
			tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); });
		});
	}

	async function generateKey() {
		const btn = container.querySelector('#ws-gen-key');
		if (!btn) return;
		btn.disabled = true;
		btn.innerHTML = '<span class="ws-spinner"></span>';
		try {
			const csrf = await fetch('/api/csrf-token', { credentials: 'include' })
				.then((r) => r.json())
				.then((j) => j.token || '')
				.catch(() => '');

			const r = await fetch('/api/api-keys', {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
				body: JSON.stringify({ name: 'Agent Screen Worker', scope: 'agents:write agents:read' }),
			});
			const j = await r.json();
			if (r.ok && (j.data?.token || j.token)) {
				apiKey = j.data?.token || j.token;
				render();
			} else {
				btn.disabled = false;
				btn.textContent = 'Generate';
				console.error('[setup] key gen failed:', j);
			}
		} catch (err) {
			btn.disabled = false;
			btn.textContent = 'Generate';
			console.error('[setup] key gen error:', err);
		}
	}

	function copyText(text, btnId) {
		navigator.clipboard.writeText(text).then(() => {
			const el = container.querySelector(`#${btnId}`);
			if (!el) return;
			const orig = el.textContent;
			el.textContent = 'Copied!';
			el.classList.add('copied');
			setTimeout(() => { el.textContent = orig; el.classList.remove('copied'); }, 1800);
		}).catch(() => {});
	}

	render();
}

// ─────────────────────────────────────────────────────────────────────────────

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
			<div class="asc-task-bar" id="asc-task-bar">
				<form class="asc-task-form" id="asc-task-form" autocomplete="off">
					<div class="asc-task-icon">▶</div>
					<input
						class="asc-task-input"
						id="asc-task-input"
						type="text"
						placeholder="Give your agent a task… (research, browse, monitor anything)"
						maxlength="1000"
						spellcheck="false"
					>
					<button class="asc-task-send" id="asc-task-send" type="submit" title="Send task">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M14.5 8L1.5 1.5L5 8L1.5 14.5L14.5 8Z" fill="currentColor"/>
						</svg>
					</button>
				</form>
				<div class="asc-task-status" id="asc-task-status"></div>
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

	// ── task input ────────────────────────────────────────────────────────
	const taskForm = document.getElementById('asc-task-form');
	const taskInput = document.getElementById('asc-task-input');
	const taskStatus = document.getElementById('asc-task-status');
	const taskSend = document.getElementById('asc-task-send');

	taskForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const text = taskInput.value.trim();
		if (!text) return;

		taskInput.disabled = true;
		taskSend.disabled = true;
		taskSend.classList.add('sending');
		taskStatus.className = 'asc-task-status';
		taskStatus.textContent = 'Queuing task…';

		try {
			const res = await fetch('/api/agent-task', {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ agentId: id, task: text }),
			});
			const j = await res.json().catch(() => ({}));
			if (res.ok) {
				const prev = taskInput.value;
				taskInput.value = '';
				taskStatus.className = 'asc-task-status ok';
				taskStatus.textContent = 'Task sent — your agent will pick it up shortly';
				addLogEntry({ ts: Date.now(), activity: `Task queued: ${prev}`, type: 'analysis' });
				setTimeout(() => { taskStatus.textContent = ''; taskStatus.className = 'asc-task-status'; }, 5000);
			} else if (res.status === 401) {
				taskStatus.className = 'asc-task-status err';
				taskStatus.innerHTML = 'Sign in to send tasks. <a href="/login" style="color:#d4d4d8">Sign in →</a>';
			} else {
				taskStatus.className = 'asc-task-status err';
				taskStatus.textContent = j.message || j.error_description || 'Could not queue task — try again';
			}
		} catch {
			taskStatus.className = 'asc-task-status err';
			taskStatus.textContent = 'Network error — check your connection';
		} finally {
			taskInput.disabled = false;
			taskSend.disabled = false;
			taskSend.classList.remove('sending');
			taskInput.focus();
		}
	});

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
