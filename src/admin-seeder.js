// /admin/seeder — Avatar Seeder control room controller.
//
// Talks to /api/admin/seeder (state + arm/disarm + run-now) and /api/admin/flags
// (generic runtime flags), both admin-session OR Bearer-secret. The secret lives
// in sessionStorage + memory, sent as `Authorization: Bearer`, never in a URL,
// cleared on any 401. Every API-sourced string is escaped before it touches the
// DOM. The 3D gallery uses <model-viewer> (loaded in the page head).

const SEEDER_API = '/api/admin/seeder';
const FLAGS_API = '/api/admin/flags';
const SECRET_KEY = 'admin_secret';
const REFRESH_MS = 10_000;

let secret = sessionStorage.getItem(SECRET_KEY) || '';
let refreshTimer = null;
let tickTimer = null;
let state = null; // last GET /api/admin/seeder payload
let busyArm = false;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
	String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── API ────────────────────────────────────────────────────────────────────
async function api(url, { method = 'GET', body } = {}) {
	const r = await fetch(url, {
		method,
		headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
		credentials: 'same-origin',
		body: body ? JSON.stringify(body) : undefined,
	});
	if (r.status === 401 || r.status === 403) {
		secret = '';
		sessionStorage.removeItem(SECRET_KEY);
		stopRefresh();
		showGate('Secret rejected. Try again.');
		throw new Error('unauthorized');
	}
	const j = await r.json().catch(() => null);
	if (!r.ok) throw new Error(j?.error_description || j?.error || `HTTP ${r.status}`);
	return j;
}

// ── Gate ───────────────────────────────────────────────────────────────────
function showGate(err = '') {
	$('sd-root').setAttribute('aria-busy', 'false');
	$('sd-panel').hidden = true;
	$('sd-gate').hidden = false;
	$('sd-gate-err').textContent = err;
	setTimeout(() => $('sd-secret').focus(), 40);
}
function showPanel() {
	$('sd-gate').hidden = true;
	$('sd-panel').hidden = false;
	$('sd-root').setAttribute('aria-busy', 'false');
}

$('sd-gate-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const val = $('sd-secret').value.trim();
	if (!val) return;
	secret = val;
	try {
		await refresh();
		sessionStorage.setItem(SECRET_KEY, secret);
		$('sd-secret').value = '';
		showPanel();
		startRefresh();
	} catch {
		/* api() already surfaced the gate error */
	}
});

// ── Render ─────────────────────────────────────────────────────────────────
function fmtAgo(iso) {
	if (!iso) return '—';
	const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}

function render(d) {
	state = d;
	const on = !!d.flag?.enabled;

	// Hero status
	const dot = $('sd-dot');
	dot.className = 'sd-dot ' + (d.circuit?.open ? 'err' : on ? 'on' : 'off');
	$('sd-state-word').textContent = d.circuit?.open ? 'Paused' : on ? 'Live' : 'Disabled';

	// Arm switch
	const arm = $('sd-arm');
	arm.classList.toggle('on', on);
	arm.setAttribute('aria-checked', on ? 'true' : 'false');
	$('sd-arm-lbl').textContent = on ? 'Live' : 'Disabled';

	// Source hint
	const src = d.flag?.source === 'db' ? 'DB flag' : 'env default';
	$('sd-sub').textContent = on
		? `Live — forging one rigged Avaturn avatar every ${d.cadence_seconds || 60}s (${src}).`
		: `Idle. Arm to forge a rigged, walk-ready Avaturn avatar every ${d.cadence_seconds || 60}s. Controlled by ${src}.`;

	// Breaker
	const breaker = $('sd-breaker');
	if (d.circuit?.open) {
		breaker.hidden = false;
		const mins = Math.max(1, Math.ceil((d.circuit.open_until - Date.now()) / 60000));
		$('sd-breaker-txt').innerHTML = `Circuit breaker tripped after <b>${d.circuit.failures}</b> failures — auto-retries in ~${mins}m. Exports are paused meanwhile.`;
	} else {
		breaker.hidden = true;
	}

	// Stats
	const s = d.stats || {};
	$('sd-s-24h').textContent = (s.last_24h ?? 0).toLocaleString();
	$('sd-s-24h-sub').textContent = `${s.last_hour ?? 0} in last hour`;
	$('sd-s-total').textContent = (s.total ?? 0).toLocaleString();
	$('sd-s-total-sub').textContent = `${s.last_7d ?? 0} this week`;
	const rig = $('sd-s-rig');
	rig.textContent = `${s.rigged_pct ?? 0}%`;
	rig.className = (s.rigged_pct >= 95 ? 'good' : s.rigged_pct >= 60 ? 'warn' : s.total ? 'bad' : '');
	$('sd-s-last').textContent = fmtAgo(s.last_at);
	$('sd-s-last-sub').textContent = s.last_at ? new Date(s.last_at).toLocaleString() : 'no exports yet';
	renderNextTick();

	renderGallery(d.recent || []);
}

function renderNextTick() {
	const el = $('sd-s-next');
	if (!el || !state) return;
	if (!state.flag?.enabled || state.circuit?.open) {
		el.textContent = '—';
		$('sd-s-next-sub').textContent = state.circuit?.open ? 'paused' : 'disarmed';
		return;
	}
	const secs = 60 - (new Date().getSeconds());
	el.textContent = `${secs}s`;
	$('sd-s-next-sub').textContent = 'cadence 60s';
}

function renderGallery(recent) {
	const wrap = $('sd-gallery');
	$('sd-gallery-meta').textContent = recent.length ? `${recent.length} newest` : '';
	if (!recent.length) {
		wrap.innerHTML = `<div class="sd-empty" style="grid-column:1/-1">
			<div class="sd-empty-mark">◎</div>
			<strong>No seeded avatars yet</strong>
			Arm the seeder — the first rigged Avaturn avatar lands within a minute.
		</div>`;
		return;
	}
	wrap.innerHTML = recent
		.map((a, i) => {
			if (!a.glb_url) return '';
			const name = esc(a.name || 'Avatar');
			const joints = a.joints ? `${a.joints} bones` : 'rigged';
			const body = a.body_type ? `<span class="sd-chip body">${esc(a.body_type)}</span>` : '';
			const open = a.profile_url
				? `<a class="sd-card-open" href="${esc(a.profile_url)}" target="_blank" rel="noopener" title="Open profile">↗</a>`
				: `<a class="sd-card-open" href="${esc(a.glb_url)}" target="_blank" rel="noopener" title="Open model">↗</a>`;
			return `<article class="sd-card" style="animation-delay:${Math.min(i * 40, 400)}ms">
				<div class="sd-card-view">
					<span class="sd-chip">✓ ${esc(joints)}</span>${body}
					<div class="sd-card-load">Loading…</div>
					<model-viewer
						src="${esc(a.glb_url)}"
						camera-controls auto-rotate rotation-per-second="16deg"
						interaction-prompt="none" disable-tap disable-zoom
						shadow-intensity="0.6" exposure="1.05"
						camera-orbit="12deg 86deg 2.5m" camera-target="0m 0.95m 0m" field-of-view="24deg"
						loading="lazy" reveal="auto"
						onload="this.previousElementSibling.style.display='none'"></model-viewer>
				</div>
				<div class="sd-card-body">
					<div style="min-width:0">
						<div class="sd-card-name">${name}</div>
						<div class="sd-card-sub">${fmtAgo(a.created_at)}</div>
					</div>
					${open}
				</div>
			</article>`;
		})
		.join('');
}

function renderFlags(flags) {
	const wrap = $('sd-flags');
	if (!flags?.length) {
		wrap.innerHTML = `<div class="sd-empty"><strong>No flags registered</strong></div>`;
		return;
	}
	wrap.innerHTML = flags
		.map((f) => {
			const src = f.exists ? 'DB' : f.env ? `env: ${esc(f.env)}` : 'default';
			return `<div class="sd-flag">
				<div class="sd-flag-txt">
					<strong>${esc(f.key)}</strong><span class="sd-flag-src">${esc(src)}</span>
					<small>${esc(f.description || '')}</small>
				</div>
				<button class="sd-toggle ${f.enabled ? 'on' : ''}" data-flag="${esc(f.key)}"
					role="switch" aria-checked="${f.enabled}" aria-label="Toggle ${esc(f.key)}"></button>
			</div>`;
		})
		.join('');
	wrap.querySelectorAll('.sd-toggle').forEach((btn) => {
		btn.addEventListener('click', () => toggleFlag(btn));
	});
}

// ── Actions ────────────────────────────────────────────────────────────────
async function refresh() {
	const [d, flags] = await Promise.all([
		api(SEEDER_API),
		api(FLAGS_API).catch(() => ({ flags: [] })),
	]);
	render(d);
	renderFlags(flags.flags || []);
}

async function setEnabled(enabled) {
	if (busyArm) return;
	busyArm = true;
	$('sd-arm').setAttribute('aria-busy', 'true');
	try {
		await api(SEEDER_API, { method: 'POST', body: { enabled } });
		toast(enabled ? 'Seeder armed — first avatar within a minute' : 'Seeder disarmed', 'good');
		await refresh();
	} catch (e) {
		toast(e.message || 'Toggle failed', 'bad');
	} finally {
		busyArm = false;
		$('sd-arm').setAttribute('aria-busy', 'false');
	}
}

async function toggleFlag(btn) {
	const key = btn.dataset.flag;
	const next = !btn.classList.contains('on');
	btn.setAttribute('aria-busy', 'true');
	try {
		await api(FLAGS_API, { method: 'POST', body: { key, enabled: next } });
		toast(`${key} ${next ? 'enabled' : 'disabled'}`, 'good');
		await refresh();
	} catch (e) {
		toast(e.message || 'Flag update failed', 'bad');
		btn.setAttribute('aria-busy', 'false');
	}
}

// Arm switch: confirm before going live; disarm is immediate.
$('sd-arm').addEventListener('click', () => {
	if (busyArm) return;
	const on = $('sd-arm').classList.contains('on');
	if (on) return setEnabled(false);
	openModal();
});
$('sd-modal-cancel').addEventListener('click', closeModal);
$('sd-modal-go').addEventListener('click', () => { closeModal(); setEnabled(true); });
$('sd-modal').addEventListener('click', (e) => { if (e.target === $('sd-modal')) closeModal(); });

function openModal() { $('sd-modal').classList.add('show'); }
function closeModal() { $('sd-modal').classList.remove('show'); }

$('sd-run').addEventListener('click', async () => {
	const btn = $('sd-run');
	btn.disabled = true;
	const label = btn.textContent;
	btn.textContent = 'Starting…';
	try {
		const r = await api(SEEDER_API, { method: 'POST', body: { action: 'run_now' } });
		toast(r.running ? 'Export running (~2 min)…' : 'Export triggered', 'good');
		setTimeout(refresh, 2500);
	} catch (e) {
		toast(e.message || 'Could not start an export', 'bad');
	} finally {
		btn.disabled = false;
		btn.textContent = label;
	}
});

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind = '') {
	const t = $('sd-toast');
	t.textContent = msg;
	t.className = `sd-toast show ${kind}`;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (t.className = 'sd-toast'), 3200);
}

// ── Refresh loop ───────────────────────────────────────────────────────────
function startRefresh() {
	stopRefresh();
	refreshTimer = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
	tickTimer = setInterval(renderNextTick, 1000);
}
function stopRefresh() {
	clearInterval(refreshTimer);
	clearInterval(tickTimer);
	refreshTimer = tickTimer = null;
}
document.addEventListener('visibilitychange', () => {
	if (document.hidden) stopRefresh();
	else if (secret && !$('sd-panel').hidden) { refresh().catch(() => {}); startRefresh(); }
});

// ── Boot ───────────────────────────────────────────────────────────────────
(async function boot() {
	if (!secret) return showGate();
	try {
		await refresh();
		showPanel();
		startRefresh();
	} catch {
		/* 401 → gate already shown */
	}
})();
