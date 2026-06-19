// popup.js — controller for the Walk Avatar popup.
//
// Wires the real three.ws API:
//   GET /api/threews/me               — session identity (username)
//   GET /api/avatars                  — the signed-in user's avatars
//   GET /api/avatars?include_public=true&visibility=public — featured/public
// Thumbnails come back on each avatar as `thumbnail_url` (a CDN URL); the GLB
// model is `model_url`. No per-thumb endpoint is needed.

const THREEWS = 'https://three.ws';

const state = {
	session: null,
	settings: {},
	selectedAvatarId: '',
	currentTab: null,
	tabEnabled: false,
	activeTab: 'mine',
};

// ── API ───────────────────────────────────────────────────────────────────
async function apiFetch(path) {
	const headers = { Accept: 'application/json' };
	if (state.session) headers['Authorization'] = `Bearer ${state.session}`;
	const res = await fetch(`${THREEWS}${path}`, { headers, credentials: 'include' });
	if (res.status === 401) {
		const err = new Error('unauthorized');
		err.status = 401;
		throw err;
	}
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

function msg(type, data = {}) {
	return chrome.runtime.sendMessage({ type, ...data });
}

function openLogin() {
	chrome.tabs.create({ url: `${THREEWS}/login?redirect=extension` });
}

// ── Auth header ────────────────────────────────────────────────────────────
async function renderAuth() {
	const pill = document.getElementById('auth-pill');
	const label = document.getElementById('auth-label');
	const signInBtn = document.getElementById('sign-in-btn');

	if (state.session) {
		try {
			const body = await apiFetch('/api/threews/me');
			const user = body?.data?.user || body?.user || {};
			pill.classList.add('signed-in');
			label.textContent = user.username ? `@${user.username}` : (user.display_name || 'signed in');
			signInBtn.textContent = 'Sign out';
			signInBtn.onclick = async () => {
				await msg('clear-session');
				state.session = null;
				renderAuth();
				loadAvatars('mine');
			};
			return;
		} catch (err) {
			if (err.status === 401) {
				await msg('clear-session');
				state.session = null;
			}
		}
	}

	pill.classList.remove('signed-in');
	label.textContent = 'not signed in';
	signInBtn.textContent = 'Sign in';
	signInBtn.onclick = openLogin;
}

// ── Avatar grids ────────────────────────────────────────────────────────────
function skeleton(n = 6) {
	return Array.from({ length: n }, () => '<div class="avatar-thumb skeleton" aria-hidden="true"></div>').join('');
}

function renderEmpty(gridEl, tab) {
	if (tab === 'mine') {
		gridEl.innerHTML = `
			<div class="empty-state" role="status">
				<div class="empty-emoji" aria-hidden="true">🚶</div>
				<div class="empty-title">No avatars yet</div>
				<p class="empty-sub">Create a 3D avatar from a selfie, then walk it on any site.</p>
				<button class="cta-btn" id="create-cta">Create your first avatar</button>
			</div>`;
		gridEl.querySelector('#create-cta')?.addEventListener('click', () => {
			chrome.tabs.create({ url: `${THREEWS}/create-selfie` });
		});
	} else {
		gridEl.innerHTML = `
			<div class="empty-state" role="status">
				<div class="empty-emoji" aria-hidden="true">✨</div>
				<div class="empty-title">No featured avatars right now</div>
				<p class="empty-sub">Check back soon, or browse the gallery.</p>
				<button class="cta-btn ghost" id="gallery-cta">Open gallery</button>
			</div>`;
		gridEl.querySelector('#gallery-cta')?.addEventListener('click', () => {
			chrome.tabs.create({ url: `${THREEWS}/gallery` });
		});
	}
}

function renderError(gridEl, errorEl, tab, message) {
	gridEl.innerHTML = '';
	errorEl.innerHTML = `
		<span class="err-text">Couldn't load avatars — ${message}</span>
		<button class="retry-btn" id="retry-${tab}">Retry</button>`;
	errorEl.style.display = 'flex';
	errorEl.querySelector(`#retry-${tab}`)?.addEventListener('click', () => loadAvatars(tab));
}

function renderAvatarGrid(gridEl, avatars) {
	gridEl.innerHTML = '';
	for (const av of avatars) {
		const thumb = document.createElement('button');
		thumb.className = 'avatar-thumb' + (av.id === state.selectedAvatarId ? ' selected' : '');
		thumb.type = 'button';
		thumb.title = av.name || 'Avatar';
		thumb.setAttribute('aria-label', `Select avatar ${av.name || ''}`.trim());
		thumb.setAttribute('aria-pressed', av.id === state.selectedAvatarId ? 'true' : 'false');

		if (av.thumbnail_url) {
			const img = document.createElement('img');
			img.src = av.thumbnail_url;
			img.alt = av.name || 'avatar';
			img.loading = 'lazy';
			img.addEventListener('error', () => {
				img.remove();
				thumb.classList.add('no-thumb');
				thumb.appendChild(fallbackGlyph(av.name));
			});
			thumb.appendChild(img);
		} else {
			thumb.classList.add('no-thumb');
			thumb.appendChild(fallbackGlyph(av.name));
		}

		thumb.addEventListener('click', () => selectAvatar(av.id, gridEl, thumb));
		gridEl.appendChild(thumb);
	}
}

function fallbackGlyph(name) {
	const span = document.createElement('span');
	span.className = 'thumb-glyph';
	span.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
	return span;
}

function selectAvatar(avatarId, gridEl, thumbEl) {
	state.selectedAvatarId = avatarId;
	for (const t of gridEl.parentElement.parentElement.querySelectorAll('.avatar-thumb')) {
		const on = t === thumbEl;
		t.classList.toggle('selected', on);
		t.setAttribute('aria-pressed', on ? 'true' : 'false');
	}
	msg('set-avatar', { avatarId });
	// If the avatar is already running on this tab, the background broadcast
	// swaps it live; otherwise the selection is stored for the next enable.
}

async function loadAvatars(tab) {
	state.activeTab = tab;
	const gridEl = document.getElementById(`grid-${tab}`);
	const errorEl = document.getElementById(`error-${tab}`);
	errorEl.style.display = 'none';
	gridEl.innerHTML = skeleton();

	try {
		if (tab === 'mine' && !state.session) {
			gridEl.innerHTML = `
				<div class="empty-state" role="status">
					<div class="empty-emoji" aria-hidden="true">🔑</div>
					<div class="empty-title">Sign in to see your avatars</div>
					<p class="empty-sub">Your three.ws avatars sync here once you sign in.</p>
					<button class="cta-btn" id="signin-cta">Sign in</button>
				</div>`;
			gridEl.querySelector('#signin-cta')?.addEventListener('click', openLogin);
			return;
		}

		const path = tab === 'mine'
			? '/api/avatars?limit=60'
			: '/api/avatars?include_public=true&visibility=public&limit=60';
		const body = await apiFetch(path);
		const avatars = (body.avatars || []).filter((a) => a && a.id);

		if (avatars.length === 0) {
			renderEmpty(gridEl, tab);
			return;
		}
		renderAvatarGrid(gridEl, avatars);
	} catch (err) {
		if (err.status === 401) {
			await msg('clear-session');
			state.session = null;
			renderAuth();
			loadAvatars(tab);
			return;
		}
		renderError(gridEl, errorEl, tab, err.message);
	}
}

// ── Current tab ──────────────────────────────────────────────────────────────
async function initCurrentTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	state.currentTab = tab;

	const siteEl = document.getElementById('current-site');
	const toggle = document.getElementById('enable-toggle');

	const restricted = !tab?.url || /^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url);
	if (restricted) {
		siteEl.textContent = 'unavailable on this page';
		toggle.disabled = true;
		toggle.closest('.footer')?.classList.add('disabled');
		return;
	}

	let host = tab.url;
	try { host = new URL(tab.url).hostname; } catch {}
	siteEl.textContent = host;

	// Per-tab enable state is kept in session storage, set when the popup toggles.
	const key = `tab_enabled_${tab.id}`;
	const stored = await chrome.storage.session.get(key).catch(() => ({}));
	state.tabEnabled = !!stored[key];
	toggle.checked = state.tabEnabled;

	// Surface allow/blocklist filtering so the user knows why a toggle is a no-op.
	const { allowed } = await msg('check-site', { url: tab.url }).catch(() => ({ allowed: true }));
	if (!allowed) {
		siteEl.innerHTML = `${host} <span class="filtered-tag">filtered</span>`;
	}
}

// ── Toggle ────────────────────────────────────────────────────────────────────
document.getElementById('enable-toggle').addEventListener('change', async (e) => {
	const enabled = e.target.checked;
	if (!state.currentTab) return;

	const key = `tab_enabled_${state.currentTab.id}`;
	const res = await msg('toggle-tab', {
		tabId: state.currentTab.id,
		enabled,
		avatarId: state.selectedAvatarId || state.settings.avatarId,
	});

	if (enabled && res && res.ok === false) {
		// Site filtered or injection blocked — revert the switch and explain.
		e.target.checked = false;
		const siteEl = document.getElementById('current-site');
		siteEl.innerHTML = `${siteEl.textContent} <span class="filtered-tag">${res.reason || res.error}</span>`;
		await chrome.storage.session.set({ [key]: false }).catch(() => {});
		return;
	}

	state.tabEnabled = enabled;
	await chrome.storage.session.set({ [key]: enabled }).catch(() => {});
});

// ── Speed slider ──────────────────────────────────────────────────────────────
const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');

speedSlider.addEventListener('input', () => {
	speedVal.textContent = parseFloat(speedSlider.value).toFixed(1) + '×';
});

speedSlider.addEventListener('change', async () => {
	const v = parseFloat(speedSlider.value);
	await msg('update-settings', { settings: { walkSpeed: v } });
});

// ── Tab bar ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
	btn.addEventListener('click', () => {
		const tab = btn.dataset.tab;
		document.querySelectorAll('.tab-btn').forEach((b) => {
			const on = b === btn;
			b.classList.toggle('active', on);
			b.setAttribute('aria-selected', on ? 'true' : 'false');
		});
		document.querySelectorAll('.tab-panel').forEach((p) => {
			p.classList.toggle('active', p.id === `tab-${tab}`);
		});
		loadAvatars(tab);
	});
});

// Open the full settings page.
document.getElementById('settings-link').addEventListener('click', (e) => {
	e.preventDefault();
	chrome.runtime.openOptionsPage();
});

// React to the session token arriving from the auth-callback tab while the
// popup is still open.
chrome.runtime.onMessage.addListener((m) => {
	if (m.type === 'session-updated' && m.token) {
		state.session = m.token;
		renderAuth();
		loadAvatars(state.activeTab);
	}
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
	const { session, settings } = await msg('get-state');
	state.session = session;
	state.settings = settings || {};
	state.selectedAvatarId = state.settings.avatarId || '';

	const speed = state.settings.walkSpeed || 1;
	speedSlider.value = String(speed);
	speedVal.textContent = parseFloat(speed).toFixed(1) + '×';

	await Promise.all([
		renderAuth(),
		initCurrentTab(),
		loadAvatars('mine'),
	]);
})();
