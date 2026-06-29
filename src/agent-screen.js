// /agent-screen — live agent screen viewer + workspace.
//
// URL: /agent-screen?agentId=<uuid>
//
// A full-bleed live "Screen" fills the stage; everything else is a floating,
// draggable, minimizable panel laid over it:
//
//   • Avatar Cam — an offscreen Three.js render of the agent's avatar head,
//     giving the agent presence. Drag, resize, minimize, hide.
//   • Activity Log — what the agent narrated with each push. Filter by type,
//     clear, drag, resize, minimize, hide.
//   • Stream Stats — live FPS / frames / resolution / data / uptime, computed
//     from the real SSE frame stream (advanced; hidden by default).
//
// Two viewing modes, both one keystroke away:
//   • Default — screen + panels + task bar + header chrome.
//   • Zen (Z) — hide ALL chrome for a clean screenshot: just the screen, and
//     optionally the avatar cam. Built for sharing.
//
// Layout (panel positions, sizes, visibility, mode, fit) persists per browser.

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
import { buildRunCommand, buildRunCommandHtml, RUNTIME_LABELS } from './agent-screen-runcmd.js';
import { createTreasuryCockpit } from './agent-screen-treasury.js';
import { MirrorPanel } from './agent-screen-mirror.js';
import {
	parsePnlDelta, accumulatePnl, emptyPnlState, unrealizedTotalUsd, emoteForExit, formatSol, formatUsd,
} from './shared/trade-pnl.js';
import { agentAvatarGlb } from './shared/agent-3d.js';
import { getMeshoptDecoder } from './viewer/internal.js';
import { ScreenshotModal } from './components/screenshot-modal.js';

// One meshopt-aware loader, built once. Optimized agent avatars ship with
// EXT_meshopt_compression, so the decoder must be wired before the loader can
// parse a single bufferView — otherwise GLTFLoader throws on compressed files.
let _glbLoaderPromise = null;
function getAvatarLoader() {
	if (!_glbLoaderPromise) {
		_glbLoaderPromise = getMeshoptDecoder()
			.then((decoder) => {
				const loader = new GLTFLoader();
				loader.setMeshoptDecoder(decoder);
				return loader;
			})
			.catch(() => new GLTFLoader()); // uncompressed avatars still load
	}
	return _glbLoaderPromise;
}

const params = new URLSearchParams(location.search);
const agentId = params.get('agentId') || '';

const noAgentEl = document.getElementById('asc-no-agent');
const stageEl = document.getElementById('asc-stage');
const agentNameEl = document.getElementById('asc-agent-name');
const liveBadgeEl = document.getElementById('asc-live-badge');
const badgeTextEl = document.getElementById('asc-badge-text');
const backEl = document.getElementById('asc-back');
const agentLinkEl = document.getElementById('asc-agent-link');
const controlsEl = document.getElementById('asc-controls');
const fsBtn = document.getElementById('asc-fullscreen-btn');
const toastWrap = document.getElementById('asc-toast-wrap');

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ── transient toast ─────────────────────────────────────────────────────────
function toast(msg, ms = 2200) {
	const el = document.createElement('div');
	el.className = 'asc-toast';
	el.textContent = msg;
	toastWrap.appendChild(el);
	setTimeout(() => {
		el.classList.add('out');
		setTimeout(() => el.remove(), 260);
	}, ms);
}

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
	document.title = 'Launch Worker · Agent Screen · three.ws';
	agentNameEl.textContent = 'Worker Setup';
	liveBadgeEl.style.display = 'none';
	controlsEl.style.display = 'none';

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
					<div class="ws-step-num">3</div>
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
				.then((j) => j.data?.token || j.token || '')
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

// ── workspace layout persistence ─────────────────────────────────────────────

const LS_KEY = 'twx_asc_workspace_v1';

function defaultLayout() {
	return {
		zen: false,
		zenCam: true,          // keep the avatar cam visible in zen by default
		fit: 'contain',        // 'contain' | 'cover'
		panels: {
			cam:      { hidden: false, min: false, x: null, y: null, w: 260 },
			log:      { hidden: false, min: false, x: null, y: null, w: 320, h: null },
			stats:    { hidden: true,  min: false, x: null, y: null, w: 218 },
			treasury: { hidden: false, min: false, x: null, y: null, w: 344, h: null },
			mirror:   { hidden: true,  min: false, x: null, y: null, w: 380, h: null },
		},
	};
}

function loadLayout() {
	const base = defaultLayout();
	try {
		const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
		base.zen = !!saved.zen;
		base.zenCam = saved.zenCam !== false;
		base.fit = saved.fit === 'cover' ? 'cover' : 'contain';
		for (const k of Object.keys(base.panels)) {
			if (saved.panels && saved.panels[k]) Object.assign(base.panels[k], saved.panels[k]);
		}
	} catch { /* corrupt or absent — defaults */ }
	return base;
}

// ─────────────────────────────────────────────────────────────────────────────

async function boot(id) {
	stageEl.style.display = '';
	const layout = loadLayout();

	let saveTimer = null;
	function saveLayout() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			try { localStorage.setItem(LS_KEY, JSON.stringify(layout)); } catch { /* quota — ignore */ }
		}, 250);
	}

	// Build the stage DOM: full-bleed screen + floating panels + task bar.
	stageEl.innerHTML = `
		<div class="asc-screen-stage">
			<canvas id="asc-screen-canvas"></canvas>
		</div>
		<div class="asc-screen-overlay" id="asc-screen-overlay">
			<div class="pulse-ring"></div>
			<p>Waiting for agent…</p>
			<small>The agent will appear here once it starts broadcasting</small>
		</div>

		<!-- Avatar cam panel -->
		<div class="asc-panel asc-panel--cam" id="asc-panel-cam" data-panel="cam">
			<div class="asc-panel-head" data-drag>
				<span class="asc-panel-grip">⠿</span>
				<span class="asc-panel-title">Avatar Cam</span>
				<div class="asc-panel-btns">
					<button class="asc-panel-btn" data-act="min" title="Minimize">▁</button>
					<button class="asc-panel-btn" data-act="close" title="Hide (C)">✕</button>
				</div>
			</div>
			<div class="asc-panel-body asc-cam-body">
				<div class="asc-webcam-bezel" id="asc-webcam-bezel">
					<div class="asc-webcam-idle" id="asc-webcam-idle">Loading avatar…</div>
					<div class="asc-webcam-badge" id="asc-webcam-badge" style="display:none">
						<span class="cam-dot"></span>
						<span id="asc-webcam-name">—</span>
					</div>
				</div>
			</div>
			<div class="asc-resize" data-resize="w"></div>
		</div>

		<!-- Activity log panel -->
		<div class="asc-panel asc-panel--log" id="asc-panel-log" data-panel="log">
			<div class="asc-panel-head" data-drag>
				<span class="asc-panel-grip">⠿</span>
				<span class="asc-panel-title">Activity Log</span>
				<div class="asc-panel-btns">
					<button class="asc-panel-btn" data-act="min" title="Minimize">▁</button>
					<button class="asc-panel-btn" data-act="close" title="Hide (L)">✕</button>
				</div>
			</div>
			<div class="asc-panel-body">
				<div class="asc-log-tools">
					<button class="asc-log-filter active" data-filter="all">All</button>
					<button class="asc-log-filter" data-filter="trade">Trade</button>
					<button class="asc-log-filter" data-filter="analysis">Analysis</button>
					<button class="asc-log-filter" data-filter="activity">Activity</button>
					<button class="asc-log-filter asc-log-clear" id="asc-log-clear" data-filter="">Clear</button>
				</div>
				<div id="asc-log">
					<div class="asc-log-empty" id="asc-log-empty">No activity yet</div>
				</div>
			</div>
			<div class="asc-resize" data-resize="wh"></div>
		</div>

		<!-- Stream stats panel (advanced) -->
		<div class="asc-panel asc-panel--stats" id="asc-panel-stats" data-panel="stats">
			<div class="asc-panel-head" data-drag>
				<span class="asc-panel-grip">⠿</span>
				<span class="asc-panel-title">Stream Stats</span>
				<div class="asc-panel-btns">
					<button class="asc-panel-btn" data-act="min" title="Minimize">▁</button>
					<button class="asc-panel-btn" data-act="close" title="Hide (I)">✕</button>
				</div>
			</div>
			<div class="asc-panel-body">
				<div class="asc-stats-grid">
					<div class="asc-stat-row"><span class="asc-stat-key">Status</span><span class="asc-stat-val dim" id="st-status">—</span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">FPS</span><span class="asc-stat-val" id="st-fps">0.0</span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">Frames</span><span class="asc-stat-val" id="st-frames">0</span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">Resolution</span><span class="asc-stat-val" id="st-res">—</span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">Data</span><span class="asc-stat-val" id="st-data">0<span class="unit">KB</span></span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">Last frame</span><span class="asc-stat-val dim" id="st-age">—</span></div>
					<div class="asc-stat-row"><span class="asc-stat-key">Uptime</span><span class="asc-stat-val dim" id="st-uptime">—</span></div>
				</div>
			</div>
		</div>

		<!-- Treasury cockpit panel -->
		<div class="asc-panel asc-panel--treasury" id="asc-panel-treasury" data-panel="treasury">
			<div class="asc-panel-head" data-drag>
				<span class="asc-panel-grip">⠿</span>
				<span class="asc-panel-title">Treasury</span>
				<div class="asc-panel-btns">
					<button class="asc-panel-btn" data-act="min" title="Minimize">▁</button>
					<button class="asc-panel-btn" data-act="close" title="Hide (T)">✕</button>
				</div>
			</div>
			<div class="asc-panel-body" id="asc-treasury-body"></div>
			<div class="asc-resize" data-resize="wh"></div>
		</div>

		<!-- Copy-trade mirror panel -->
		<div class="asc-panel asc-panel--mirror" id="asc-panel-mirror" data-panel="mirror">
			<div class="asc-panel-head" data-drag>
				<span class="asc-panel-grip">⠿</span>
				<span class="asc-panel-title">Mirror</span>
				<div class="asc-panel-btns">
					<button class="asc-panel-btn" data-act="min" title="Minimize">▁</button>
					<button class="asc-panel-btn" data-act="close" title="Hide (M)">✕</button>
				</div>
			</div>
			<div class="asc-panel-body" id="asc-mirror-body"></div>
			<div class="asc-resize" data-resize="wh"></div>
		</div>

		<!-- Task input -->
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

		<!-- Zen exit hint -->
		<div class="asc-zen-hint" id="asc-zen-hint">
			<span>Zen mode · <kbd>C</kbd> cam · <kbd>Z</kbd> exit</span>
			<button id="asc-zen-exit">Exit</button>
		</div>
	`;

	const screenCanvas = document.getElementById('asc-screen-canvas');
	const screenOverlay = document.getElementById('asc-screen-overlay');
	const screenCtx = screenCanvas.getContext('2d');
	const logEl = document.getElementById('asc-log');
	let logEmpty = document.getElementById('asc-log-empty');
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
			agentLinkEl.innerHTML = `${esc(agentName)} →`;
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

	let webcamAnimManager = null;
	let webcamAvatar = null;
	let webcamRafId = null;
	let webcamCanvas = null;

	function sizeWebcam() {
		if (!webcamCanvas) return;
		const bw = webcamBezel.clientWidth || 256;
		const bh = Math.round(bw * 3 / 4);
		webcamRenderer.setSize(bw, bh, false);
	}

	async function mountAvatarWebcam(glbUrl) {
		try {
			const loader = await getAvatarLoader();
			const gltf = await loader.loadAsync(glbUrl || '/avatars/default.glb');
			const model = cloneSkinnedScene(gltf.scene);
			webcamScene.add(model);
			webcamAvatar = model;

			const box = new Box3().setFromObject(model);
			const h = box.max.y;
			webcamCamera.position.set(0, h - 0.12, 0.72);
			webcamCamera.lookAt(0, h - 0.18, 0);

			// Universal canonical clip library retargets the pre-baked idle onto ANY
			// humanoid rig (Mixamo, Avaturn, VRM, …). The GLB's own animations are
			// intentionally ignored — most avatars ship none, so the shared clip is
			// what gives every agent presence. A rig that can't be skeleton-driven
			// falls back to its authored bind pose (supportsCanonicalClips() gate).
			webcamAnimManager = new AnimationManager();
			webcamAnimManager.attach(model, { avatarUrl: glbUrl || '/avatars/default.glb' });
			if (webcamAnimManager.supportsCanonicalClips()) {
				try {
					const manifest = await fetch('/animations/manifest.json', { cache: 'force-cache' })
						.then((r) => {
							if (!r.ok) throw new Error(`HTTP ${r.status} fetching animation manifest`);
							return r.json();
						});
					// Register the idle loop plus the trade-reaction one-shots so the
					// avatar can celebrate a win, slump on a loss, and wave on session
					// start. The one-shots load lazily on first playOnce — only `idle`
					// is forced up front so the head is alive immediately.
					const REACTION_CLIPS = ['idle', 'celebrate', 'defeated', 'wave'];
					const defs = manifest.filter((d) => REACTION_CLIPS.includes(d.name));
					const idleDef = defs.filter((d) => d.name === 'idle');
					if (defs.length) {
						webcamAnimManager.setAnimationDefs(defs);
						if (idleDef.length) {
							await webcamAnimManager.ensureLoaded('idle');
							webcamAnimManager.play('idle');
						}
					}
				} catch (err) {
					console.warn('[agent-screen] idle clip load failed:', err);
				}
			}

			webcamCanvas = webcamRenderer.domElement;
			webcamCanvas.style.cssText = 'width:100%;height:100%;object-fit:cover;';
			sizeWebcam();
			webcamIdle.style.display = 'none';
			webcamBezel.appendChild(webcamCanvas);
			webcamBadge.style.display = 'flex';

			let last = 0;
			function webcamTick(t) {
				webcamRafId = requestAnimationFrame(webcamTick);
				const dt = Math.min((t - last) / 1000, 0.1);
				last = t;
				webcamAnimManager?.update(dt);
				webcamRenderer.render(webcamScene, webcamCamera);
			}
			webcamRafId = requestAnimationFrame(webcamTick);
		} catch (err) {
			console.warn('[agent-screen] avatar webcam load failed:', err);
			webcamIdle.textContent = 'Avatar unavailable';
		}
	}

	mountAvatarWebcam(avatarGlbUrl || '/avatars/default.glb');

	// ── screen canvas rendering ────────────────────────────────────────────
	let lastFrameImg = null;

	function renderFrame(frame) {
		if (!frame?.data) return;
		const img = new Image();
		img.onload = () => {
			const w = img.naturalWidth || 1280;
			const h = img.naturalHeight || 720;
			if (screenCanvas.width !== w) screenCanvas.width = w;
			if (screenCanvas.height !== h) screenCanvas.height = h;
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
	}

	// ── live stream stats (all real, derived from the SSE frames) ───────────
	const st = {
		status: document.getElementById('st-status'),
		fps: document.getElementById('st-fps'),
		frames: document.getElementById('st-frames'),
		res: document.getElementById('st-res'),
		data: document.getElementById('st-data'),
		age: document.getElementById('st-age'),
		uptime: document.getElementById('st-uptime'),
	};
	let frameCount = 0;
	let bytesTotal = 0;
	let streamStart = 0;
	let lastFrameAt = 0;
	const frameTimes = []; // recent arrival timestamps for FPS

	function recordFrame(frame) {
		const now = Date.now();
		frameCount++;
		if (!streamStart) streamStart = now;
		lastFrameAt = now;
		if (frame?.data) bytesTotal += Math.round(frame.data.length * 0.75); // base64 → bytes
		frameTimes.push(now);
		while (frameTimes.length > 30) frameTimes.shift();
	}

	function fmtBytes(b) {
		if (b < 1024) return `${b}<span class="unit">B</span>`;
		if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}<span class="unit">KB</span>`;
		return `${(b / 1024 / 1024).toFixed(2)}<span class="unit">MB</span>`;
	}
	function fmtClock(ms) {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		const ss = String(s % 60).padStart(2, '0');
		if (m >= 60) { const hh = Math.floor(m / 60); return `${hh}:${String(m % 60).padStart(2, '0')}:${ss}`; }
		return `${m}:${ss}`;
	}

	function updateStats() {
		const live = !liveBadgeEl.classList.contains('dark');
		st.status.textContent = live ? 'LIVE' : (streamStart ? 'OFFLINE' : '—');
		st.status.classList.toggle('dim', !live);
		// FPS over the rolling window
		let fps = 0;
		if (frameTimes.length >= 2) {
			const span = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000;
			if (span > 0) fps = (frameTimes.length - 1) / span;
		}
		st.fps.textContent = fps.toFixed(1);
		st.frames.textContent = String(frameCount);
		st.res.textContent = screenCanvas.width ? `${screenCanvas.width}×${screenCanvas.height}` : '—';
		st.data.innerHTML = fmtBytes(bytesTotal);
		st.age.textContent = lastFrameAt ? `${Math.round((Date.now() - lastFrameAt) / 1000)}s ago` : '—';
		st.uptime.textContent = streamStart ? fmtClock(Date.now() - streamStart) : '—';
	}
	setInterval(updateStats, 1000);

	// ── activity log ──────────────────────────────────────────────────────
	const MAX_LOG = 120;
	let logCount = 0;

	function fmtTime(ts) {
		const d = new Date(ts);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function addLogEntry({ ts, activity, type, pnl }) {
		if (logEmpty) { logEmpty.remove(); logEmpty = null; }
		const entry = document.createElement('div');
		const typeLabel = type || 'activity';
		entry.className = `asc-log-entry type-${typeLabel}`;
		// Tint realized exits by sign so the log reads as a green/red P&L tape.
		const exitDelta = parsePnlDelta(pnl);
		if (exitDelta?.phase === 'exit') {
			const v = exitDelta.solDelta != null ? exitDelta.solDelta : exitDelta.realizedUsd;
			if (v > 0) entry.classList.add('pnl-pos');
			else if (v < 0) entry.classList.add('pnl-neg');
		}
		entry.innerHTML = `
			<span class="asc-log-time">${fmtTime(ts || Date.now())}</span>
			<span class="asc-log-type ${typeLabel}">${typeLabel}</span>
			<span class="asc-log-text">${esc(activity || '')}</span>
		`;
		logEl.prepend(entry);
		logCount++;
		while (logCount > MAX_LOG) {
			logEl.lastElementChild?.remove();
			logCount--;
		}
	}

	// log filter chips + clear
	logEl.parentElement.querySelectorAll('.asc-log-filter').forEach((btn) => {
		btn.addEventListener('click', () => {
			if (btn.id === 'asc-log-clear') {
				logEl.querySelectorAll('.asc-log-entry').forEach((e) => e.remove());
				logCount = 0;
				logEmpty = document.createElement('div');
				logEmpty.className = 'asc-log-empty';
				logEmpty.textContent = 'No activity yet';
				logEl.appendChild(logEmpty);
				return;
			}
			const f = btn.dataset.filter;
			logEl.parentElement.querySelectorAll('.asc-log-filter:not(.asc-log-clear)')
				.forEach((b) => b.classList.toggle('active', b === btn));
			logEl.classList.remove('filtered-trade', 'filtered-analysis', 'filtered-activity', 'filtered-screenshot');
			if (f && f !== 'all') logEl.classList.add(`filtered-${f}`);
		});
	});

	// ── live PnL ticker ───────────────────────────────────────────────────
	// Folds real 'trade' frames into a running session total (realized +
	// unrealized, from real fills) and drives a transform-based count-up. Every
	// number comes from an actual fill — no fake progress. Frames are deduped by
	// timestamp so the reconnect backfill can't double-count an exit.
	const pnlBtn = document.getElementById('asc-pnl');
	const pnlValueEl = document.getElementById('asc-pnl-value');
	const pnlDetailEl = document.getElementById('asc-pnl-detail');
	let pnlState = emptyPnlState();
	const seenPnlTs = new Set();
	let sawUsd = false;           // at least one fill priced into USD
	let pnlDetailed = false;      // compact ⇄ detailed toggle
	let pnlAnimFrom = 0;          // count-up animation origin (primary unit)
	let pnlAnimTo = 0;
	let pnlAnimStart = 0;
	let pnlAnimRaf = null;

	// Primary display number: USD when any fill priced, else realized SOL.
	function pnlPrimary() {
		if (sawUsd) return pnlState.realizedUsd + unrealizedTotalUsd(pnlState);
		return pnlState.realizedSol;
	}

	function paintPnl(shownPrimary) {
		const sign = shownPrimary > 1e-9 ? 'pos' : shownPrimary < -1e-9 ? 'neg' : '';
		pnlBtn.classList.toggle('pos', sign === 'pos');
		pnlBtn.classList.toggle('neg', sign === 'neg');
		pnlValueEl.textContent = sawUsd
			? (formatUsd(shownPrimary) ?? '—')
			: formatSol(shownPrimary);
		if (pnlDetailed) {
			pnlDetailEl.hidden = false;
			const wl = `${pnlState.wins}W · ${pnlState.losses}L`;
			const realized = sawUsd ? formatSol(pnlState.realizedSol) : (formatUsd(pnlState.realizedUsd) ?? null);
			const unreal = unrealizedTotalUsd(pnlState);
			const unrealStr = sawUsd && Math.abs(unreal) > 1e-9 ? ` · unreal ${formatUsd(unreal)}` : '';
			pnlDetailEl.textContent = `${wl}${realized ? ` · ${realized}` : ''}${unrealStr}`;
		} else {
			pnlDetailEl.hidden = true;
		}
	}

	function animatePnl() {
		const DURATION = 520;
		const tick = (now) => {
			const t = Math.min(1, (now - pnlAnimStart) / DURATION);
			const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
			const shown = pnlAnimFrom + (pnlAnimTo - pnlAnimFrom) * eased;
			paintPnl(shown);
			if (t < 1) pnlAnimRaf = requestAnimationFrame(tick);
			else pnlAnimRaf = null;
		};
		if (pnlAnimRaf) cancelAnimationFrame(pnlAnimRaf);
		pnlAnimRaf = requestAnimationFrame(tick);
	}

	// Ingest one trade frame/log entry. Returns the parsed exit delta (or null)
	// so the caller can fire the matching avatar emote on a fresh exit only.
	function ingestTrade(entry) {
		const delta = parsePnlDelta(entry?.pnl);
		if (!delta) return null;
		const ts = Number(entry.ts) || 0;
		// Dedupe additive exits by timestamp; idempotent holds may always re-apply.
		if (delta.phase === 'exit') {
			if (ts && seenPnlTs.has(ts)) return null;
			if (ts) seenPnlTs.add(ts);
		}
		if (delta.realizedUsd != null) sawUsd = true;
		pnlState = accumulatePnl(pnlState, delta);

		pnlBtn.hidden = false;
		pnlAnimFrom = Number.isFinite(pnlAnimTo) ? pnlAnimTo : 0;
		pnlAnimTo = pnlPrimary();
		pnlAnimStart = performance.now();
		animatePnl();
		// brief bump only on a realized exit (the watchable moment)
		if (delta.phase === 'exit') {
			pnlBtn.classList.remove('bump');
			void pnlBtn.offsetWidth; // restart the keyframe
			pnlBtn.classList.add('bump');
		}
		return delta;
	}

	// Fire the avatar reaction for a realized exit. Gated on a skeleton-driveable
	// rig so avatars that can't take canonical clips simply skip the emote (never
	// a T-pose). Loads the one-shot lazily, then settles back to idle.
	function emoteForTrade(delta) {
		const clip = emoteForExit(delta);
		if (!clip) return;
		if (!webcamAnimManager || !webcamAnimManager.supportsCanonicalClips()) return;
		webcamAnimManager.playOnce(clip, { settleTo: 'idle' }).catch(() => {});
	}

	// compact ⇄ detailed toggle (click or keyboard focus + Enter/Space on the button)
	pnlBtn.addEventListener('click', () => {
		pnlDetailed = !pnlDetailed;
		paintPnl(pnlAnimTo);
	});

	// ── SSE client ─────────────────────────────────────────────────────────
	let greeted = false; // wave once, on the first live connection only
	let treasuryCockpit = null; // set once the Treasury panel mounts (below)
	let mirrorPanel = null;     // set once the Mirror panel mounts (below)
	const client = createAgentScreenClient(id, {
		onOpen({ agentName: n }) {
			if (n) { agentNameEl.textContent = n; agentName = n; webcamName.textContent = n; }
			badgeTextEl.textContent = 'Connecting…';
		},
		onFrame(frame) {
			setLive();
			recordFrame(frame);
			if (frame.data) renderFrame(frame);
			if (frame.activity) { addLogEntry(frame); treasuryCockpit?.observeLog([frame]); }
			if (frame.type === 'trade') {
				const delta = ingestTrade(frame);
				if (delta) emoteForTrade(delta);
			}
			// Greet on the first live frame if onOpen's metadata event was missed.
			if (!greeted) {
				greeted = true;
				if (webcamAnimManager?.supportsCanonicalClips()) {
					webcamAnimManager.playOnce('wave', { settleTo: 'idle' }).catch(() => {});
				}
			}
		},
		onLog(entries) {
			// Backfill: render the rows and fold their PnL in (deduped by ts), but
			// don't emote — these are history, not a fresh fill happening on camera.
			entries.forEach((e) => { addLogEntry(e); ingestTrade(e); });
			treasuryCockpit?.observeLog(entries);
		},
		onDark() { setDark(); },
		onError() {
			badgeTextEl.textContent = 'Reconnecting…';
			liveBadgeEl.classList.add('dark');
		},
	});

	client.connect();

	// ── task input ──────────────────────────────────────────────────────────
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

	// ── panels: drag / resize / minimize / hide + persistence ────────────────
	const panelEls = {
		cam: document.getElementById('asc-panel-cam'),
		log: document.getElementById('asc-panel-log'),
		stats: document.getElementById('asc-panel-stats'),
		treasury: document.getElementById('asc-panel-treasury'),
		mirror: document.getElementById('asc-panel-mirror'),
	};
	let zTop = 30;

	function focusPanel(el) {
		el.style.zIndex = String(++zTop);
	}

	function placePanel(name) {
		const el = panelEls[name];
		const p = layout.panels[name];
		const sr = stageEl.getBoundingClientRect();
		// width / height
		if (p.w) el.style.width = `${p.w}px`;
		if (p.h && (name === 'log' || name === 'treasury' || name === 'mirror')) el.style.height = `${p.h}px`;
		// default position if none saved yet
		const pw = el.offsetWidth || p.w || 240;
		const ph = el.offsetHeight || 200;
		let x = p.x, y = p.y;
		if (x == null || y == null) {
			const M = 16;
			if (name === 'stats') { x = M; y = M; }
			else if (name === 'treasury') { x = M; y = M + 6; } // treasury → top-left cockpit
			else if (name === 'mirror') { x = M; y = sr.height - ph - M; } // mirror → bottom-left
			else if (name === 'log') { x = sr.width - pw - M; y = M; }
			else { x = sr.width - pw - M; y = sr.height - ph - M; } // cam → bottom-right
		}
		x = clamp(x, 0, Math.max(0, sr.width - pw));
		y = clamp(y, 0, Math.max(0, sr.height - ph));
		el.style.left = `${x}px`;
		el.style.top = `${y}px`;
		el.style.right = 'auto';
		el.style.bottom = 'auto';
		el.classList.toggle('minimized', !!p.min);
		el.hidden = !!p.hidden;
		updateToggleButtons();
	}

	function makeDraggable(name) {
		const el = panelEls[name];
		const handle = el.querySelector('[data-drag]');
		let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
		handle.addEventListener('pointerdown', (e) => {
			if (e.target.closest('.asc-panel-btn')) return;
			dragging = true;
			handle.setPointerCapture(e.pointerId);
			el.classList.add('dragging');
			focusPanel(el);
			const r = el.getBoundingClientRect();
			const sr = stageEl.getBoundingClientRect();
			ox = r.left - sr.left; oy = r.top - sr.top;
			sx = e.clientX; sy = e.clientY;
		});
		handle.addEventListener('pointermove', (e) => {
			if (!dragging) return;
			const sr = stageEl.getBoundingClientRect();
			const nx = clamp(ox + (e.clientX - sx), 0, sr.width - el.offsetWidth);
			const ny = clamp(oy + (e.clientY - sy), 0, sr.height - el.offsetHeight);
			el.style.left = `${nx}px`;
			el.style.top = `${ny}px`;
		});
		const end = () => {
			if (!dragging) return;
			dragging = false;
			el.classList.remove('dragging');
			layout.panels[name].x = parseFloat(el.style.left) || 0;
			layout.panels[name].y = parseFloat(el.style.top) || 0;
			saveLayout();
		};
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
	}

	function makeResizable(name) {
		const el = panelEls[name];
		const handle = el.querySelector('[data-resize]');
		if (!handle) return;
		const mode = handle.dataset.resize; // 'w' | 'wh'
		let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
		handle.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
			resizing = true;
			handle.setPointerCapture(e.pointerId);
			focusPanel(el);
			sx = e.clientX; sy = e.clientY;
			sw = el.offsetWidth; sh = el.offsetHeight;
		});
		handle.addEventListener('pointermove', (e) => {
			if (!resizing) return;
			const sr = stageEl.getBoundingClientRect();
			const maxW = sr.width - el.offsetLeft - 8;
			const w = clamp(sw + (e.clientX - sx), 168, Math.max(168, maxW));
			el.style.width = `${w}px`;
			layout.panels[name].w = Math.round(w);
			if (mode === 'wh') {
				const maxH = sr.height - el.offsetTop - 8;
				const h = clamp(sh + (e.clientY - sy), 150, Math.max(150, maxH));
				el.style.height = `${h}px`;
				layout.panels[name].h = Math.round(h);
			} else {
				sizeWebcam(); // cam: keep renderer matched to new width
			}
		});
		const end = () => { if (resizing) { resizing = false; saveLayout(); sizeWebcam(); } };
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
	}

	for (const name of Object.keys(panelEls)) {
		const el = panelEls[name];
		makeDraggable(name);
		makeResizable(name);
		el.addEventListener('pointerdown', () => focusPanel(el));
		el.querySelector('[data-act="min"]').addEventListener('click', () => {
			const p = layout.panels[name];
			p.min = !p.min;
			el.classList.toggle('minimized', p.min);
			saveLayout();
		});
		el.querySelector('[data-act="close"]').addEventListener('click', () => setPanelHidden(name, true));
	}

	// ── Treasury cockpit: live autonomous-treasury control surface ───────────
	// Mounts into the Treasury panel body; fetches its own real data (owner-only
	// GET, 403 ⇒ viewer explainer) and ticks the live balance. The SSE handlers
	// above forward activity into it via treasuryCockpit?.observeLog(...).
	treasuryCockpit = createTreasuryCockpit({
		agentId: id,
		bodyEl: document.getElementById('asc-treasury-body'),
		toast,
	});

	// ── Copy-trade mirror: live source/mirror cockpit ────────────────────────
	// Owner drives the source-detect → re-quote → guarded-replicate loop and
	// pushes the dual-column frame to the wall; a viewer sees a read-only armed
	// state. Owns its own SSE to /api/pump/trades-stream (real PumpPortal feed).
	mirrorPanel = new MirrorPanel({
		body: document.getElementById('asc-mirror-body'),
		agentId: id,
		agentName,
		onToast: toast,
	});

	function setPanelHidden(name, hidden) {
		layout.panels[name].hidden = hidden;
		const el = panelEls[name];
		el.hidden = hidden;
		if (!hidden) { placePanel(name); focusPanel(el); sizeWebcam(); }
		updateToggleButtons();
		saveLayout();
	}
	function togglePanel(name) { setPanelHidden(name, !layout.panels[name].hidden); }

	function updateToggleButtons() {
		controlsEl.querySelectorAll('[data-panel-toggle]').forEach((b) => {
			b.classList.toggle('active', !layout.panels[b.dataset.panelToggle].hidden);
		});
	}

	controlsEl.querySelectorAll('[data-panel-toggle]').forEach((b) => {
		b.addEventListener('click', () => togglePanel(b.dataset.panelToggle));
	});

	// initial placement (after layout so offsetWidth is correct)
	requestAnimationFrame(() => {
		for (const name of Object.keys(panelEls)) placePanel(name);
		sizeWebcam();
	});

	// keep panels inside the stage on resize
	window.addEventListener('resize', () => {
		for (const name of Object.keys(panelEls)) {
			if (!layout.panels[name].hidden) placePanel(name);
		}
		sizeWebcam();
	});

	// ── fit / fill ───────────────────────────────────────────────────────────
	const fitBtn = document.getElementById('asc-fit-btn');
	function applyFit() {
		stageEl.classList.toggle('fit-cover', layout.fit === 'cover');
		fitBtn.classList.toggle('active', layout.fit === 'cover');
		fitBtn.title = layout.fit === 'cover' ? 'Fill (cropped) — click to fit — V' : 'Fit (letterboxed) — click to fill — V';
	}
	function toggleFit() {
		layout.fit = layout.fit === 'cover' ? 'contain' : 'cover';
		applyFit();
		saveLayout();
		toast(layout.fit === 'cover' ? 'Screen: fill' : 'Screen: fit');
	}
	fitBtn.addEventListener('click', toggleFit);
	applyFit();

	// ── zen mode ──────────────────────────────────────────────────────────────
	const zenBtn = document.getElementById('asc-zen-btn');
	document.getElementById('asc-zen-exit').addEventListener('click', () => setZen(false));
	function applyZen() {
		document.body.classList.toggle('asc-zen', layout.zen);
		document.body.classList.toggle('asc-zen-cam', layout.zen && layout.zenCam);
		zenBtn.classList.toggle('active', layout.zen);
	}
	function setZen(on) {
		layout.zen = on;
		applyZen();
		saveLayout();
		if (on) toast('Zen mode — press Z to exit, C for cam');
	}
	zenBtn.addEventListener('click', () => setZen(!layout.zen));
	applyZen();

	// peek header / task bar near edges while in zen
	let peekTimer = null;
	stageEl.addEventListener('pointermove', (e) => {
		if (!layout.zen) return;
		const r = stageEl.getBoundingClientRect();
		const nearTop = e.clientY - r.top < 56;
		const nearBottom = r.bottom - e.clientY < 80;
		document.body.classList.toggle('asc-peek', nearTop);
		document.body.classList.toggle('asc-peek-bottom', nearBottom);
		clearTimeout(peekTimer);
		peekTimer = setTimeout(() => {
			document.body.classList.remove('asc-peek', 'asc-peek-bottom');
		}, 2400);
	});

	// ── screenshot (real canvas capture → share modal) ───────────────────────
	const shotModal = new ScreenshotModal(document.body);
	const shotBtn = document.getElementById('asc-shot-btn');
	function screenshot() {
		if (!screenCanvas.width || !lastFrameImg) { toast('No frame to capture yet'); return; }
		screenCanvas.toBlob((blob) => {
			if (blob) shotModal.show(blob);
			else toast('Capture failed');
		}, 'image/png');
	}
	shotBtn.addEventListener('click', screenshot);

	// ── picture-in-picture (real PiP of the live screen) ─────────────────────
	const pipBtn = document.getElementById('asc-pip-btn');
	let pipVideo = null;
	if (!document.pictureInPictureEnabled) pipBtn.style.display = 'none';
	async function togglePip() {
		try {
			if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
			if (!screenCanvas.width) { toast('No frame yet'); return; }
			if (!pipVideo) {
				pipVideo = document.createElement('video');
				pipVideo.muted = true;
				pipVideo.playsInline = true;
				pipVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
				document.body.appendChild(pipVideo);
				pipVideo.srcObject = screenCanvas.captureStream(15);
				pipVideo.addEventListener('leavepictureinpicture', () => pipBtn.classList.remove('active'));
			}
			await pipVideo.play().catch(() => {});
			await pipVideo.requestPictureInPicture();
			pipBtn.classList.add('active');
		} catch (err) {
			console.warn('[agent-screen] PiP failed:', err);
			toast('Picture-in-picture unavailable');
		}
	}
	pipBtn.addEventListener('click', togglePip);

	// ── fullscreen ───────────────────────────────────────────────────────────
	fsBtn.addEventListener('click', () => {
		if (!document.fullscreenElement) stageEl.requestFullscreen?.().catch(() => {});
		else document.exitFullscreen?.().catch(() => {});
	});
	document.addEventListener('fullscreenchange', () => {
		fsBtn.classList.toggle('active', !!document.fullscreenElement);
	});

	// ── keyboard shortcuts ───────────────────────────────────────────────────
	const help = buildHelpOverlay();
	window.addEventListener('keydown', (e) => {
		if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
		const k = e.key.toLowerCase();
		if (k === 'z') { setZen(!layout.zen); e.preventDefault(); }
		else if (k === 'c') { if (layout.zen) { layout.zenCam = !layout.zenCam; applyZen(); saveLayout(); } else togglePanel('cam'); e.preventDefault(); }
		else if (k === 'l') { togglePanel('log'); e.preventDefault(); }
		else if (k === 'i') { togglePanel('stats'); e.preventDefault(); }
		else if (k === 's') { screenshot(); e.preventDefault(); }
		else if (k === 'p') { togglePip(); e.preventDefault(); }
		else if (k === 'v') { toggleFit(); e.preventDefault(); }
		else if (k === 'f') { fsBtn.click(); e.preventDefault(); }
		else if (k === '?' || (k === '/' && e.shiftKey)) { help.toggle(); e.preventDefault(); }
		else if (k === 'escape') {
			if (help.isOpen()) help.close();
			else if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
			else if (layout.zen) setZen(false);
		}
	});

	// Cleanup on unload
	window.addEventListener('beforeunload', () => {
		client.disconnect();
		if (pnlAnimRaf) cancelAnimationFrame(pnlAnimRaf);
		if (webcamRafId) cancelAnimationFrame(webcamRafId);
		webcamAnimManager?.detach();
		webcamRenderer.dispose();
		if (pipVideo?.srcObject) pipVideo.srcObject.getTracks().forEach((t) => t.stop());
	});
}

// ── keyboard help overlay ─────────────────────────────────────────────────────
function buildHelpOverlay() {
	const el = document.createElement('div');
	el.className = 'asc-help';
	el.innerHTML = `
		<div class="asc-help-card">
			<div class="asc-help-head">
				<h3>Keyboard shortcuts</h3>
				<button class="asc-panel-btn" id="asc-help-close" title="Close">✕</button>
			</div>
			<div class="asc-help-body">
				<div class="asc-help-row"><span>Zen mode (hide chrome)</span><kbd>Z</kbd></div>
				<div class="asc-help-row"><span>Toggle avatar cam</span><kbd>C</kbd></div>
				<div class="asc-help-row"><span>Toggle activity log</span><kbd>L</kbd></div>
				<div class="asc-help-row"><span>Toggle stream stats</span><kbd>I</kbd></div>
				<div class="asc-help-row"><span>Capture screenshot</span><kbd>S</kbd></div>
				<div class="asc-help-row"><span>Picture-in-picture</span><kbd>P</kbd></div>
				<div class="asc-help-row"><span>Fit / fill screen</span><kbd>V</kbd></div>
				<div class="asc-help-row"><span>Fullscreen</span><kbd>F</kbd></div>
				<div class="asc-help-row"><span>This help</span><kbd>?</kbd></div>
			</div>
		</div>
	`;
	document.body.appendChild(el);
	const close = () => el.classList.remove('open');
	el.addEventListener('click', (e) => { if (e.target === el) close(); });
	el.querySelector('#asc-help-close').addEventListener('click', close);
	return {
		toggle: () => el.classList.toggle('open'),
		open: () => el.classList.add('open'),
		close,
		isOpen: () => el.classList.contains('open'),
	};
}

function esc(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
