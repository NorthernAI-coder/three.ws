// Agora passport panel — the click-to-inspect side panel for a single citizen.
//
// Clicking (or keyboard-activating) a citizen opens this panel, which fetches
// /api/agora/passport?id=… and shows the real basics: name, profession, status,
// reputation, stake, tasks completed, and recent activity. The rich living
// passport (identity handshake, verify-the-deliverable) is Task 07 — this is a
// clean, real first version with designed loading / error / empty states.
//
// Non-modal: the world stays interactive behind it. Esc closes; focus moves into
// the panel on open and returns to the trigger on close.

import { professionColor } from './citizen-avatar.js';
import { log } from '../shared/log.js';

const THREE_DECIMALS = 6;
const LAMPORTS_PER_SOL = 1e9;

const fmtThree = (atomic) => {
	const n = Number(atomic || 0) / 10 ** THREE_DECIMALS;
	if (!Number.isFinite(n) || n === 0) return '0';
	if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
	if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
	return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const fmtSol = (lamports) => {
	const n = Number(lamports || 0) / LAMPORTS_PER_SOL;
	if (!Number.isFinite(n) || n === 0) return '0';
	return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
};
const fmtTimeAgo = (iso) => {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return '';
	const s = Math.max(0, (Date.now() - then) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
	{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const ACTIVITY_LABEL = {
	posted_task: 'Posted a task',
	claimed_task: 'Claimed a task',
	completed_task: 'Completed a task',
	earned: 'Earned',
	slashed: 'Stake slashed',
	vouched: 'Vouched',
	registered: 'Registered on-chain',
};

export class PassportPanel {
	constructor() {
		this._el = this._build();
		document.body.appendChild(this._el);
		this._bodyEl = this._el.querySelector('#agora-passport-body');
		this._titleEl = this._el.querySelector('#agora-passport-title');
		this._trigger = null;       // element to restore focus to on close
		this._reqId = 0;            // guards against out-of-order responses
		this._currentId = null;
		this._onClose = null;

		this._el.querySelector('.agora-passport-close').addEventListener('click', () => this.close());
		this._onKey = (e) => { if (e.key === 'Escape' && this.isOpen()) { e.stopPropagation(); this.close(); } };
		document.addEventListener('keydown', this._onKey);
	}

	_build() {
		const aside = document.createElement('aside');
		aside.id = 'agora-passport';
		aside.className = 'agora-passport';
		aside.setAttribute('role', 'dialog');
		aside.setAttribute('aria-label', 'Citizen passport');
		aside.setAttribute('aria-modal', 'false');
		aside.hidden = true;
		aside.innerHTML = `
			<header class="agora-passport-head">
				<h2 id="agora-passport-title">Passport</h2>
				<button class="agora-passport-close" type="button" aria-label="Close passport">
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
				</button>
			</header>
			<div id="agora-passport-body" class="agora-passport-body" tabindex="-1"></div>`;
		return aside;
	}

	isOpen() { return !this._el.hidden; }

	/**
	 * Open the panel for a citizen and fetch its passport.
	 * @param {string} id citizen id
	 * @param {{ trigger?: HTMLElement, onClose?: Function, hint?: object }} [opts]
	 *   hint: a citizen object from the list, rendered immediately so the header
	 *   isn't blank while the passport request is in flight.
	 */
	async open(id, { trigger = null, onClose = null, hint = null } = {}) {
		this._trigger = trigger;
		this._onClose = onClose;
		this._currentId = id;
		const reqId = ++this._reqId;

		this._el.hidden = false;
		this._el.classList.add('open');
		this._titleEl.textContent = hint?.displayName || 'Passport';
		this._renderLoading(hint);
		// Move focus into the panel for keyboard + screen-reader users.
		this._bodyEl.focus({ preventScroll: true });

		try {
			const res = await fetch(`/api/agora/passport?id=${encodeURIComponent(id)}`, {
				headers: { accept: 'application/json' },
			});
			if (reqId !== this._reqId) return; // superseded by a newer open()
			if (!res.ok) {
				const detail = res.status === 404 ? 'This citizen is no longer in the registry.' : `Request failed (${res.status}).`;
				this._renderError(id, detail);
				return;
			}
			const data = await res.json();
			if (reqId !== this._reqId) return;
			this._render(data);
		} catch (err) {
			if (reqId !== this._reqId) return;
			log.warn('[agora] passport fetch failed', err?.message);
			this._renderError(id, 'Network error — the registry could not be reached.');
		}
	}

	close() {
		if (this._el.hidden) return;
		this._el.classList.remove('open');
		this._el.hidden = true;
		this._currentId = null;
		const t = this._trigger;
		const cb = this._onClose;
		this._trigger = null;
		this._onClose = null;
		try { cb?.(); } catch (e) { log.warn('[agora] passport onClose threw', e); }
		// Restore focus to whatever opened the panel (an accessible list button).
		if (t && typeof t.focus === 'function') t.focus({ preventScroll: true });
	}

	get currentId() { return this._currentId; }

	// ── Renderers ──────────────────────────────────────────────────────────────

	_renderLoading(hint) {
		const accent = hint ? professionColor(hint.profession || hint.professions?.[0]?.key) : '#9fb4cc';
		this._bodyEl.innerHTML = `
			<div class="agora-pp-hero">
				<span class="agora-pp-dot" style="background:${accent}"></span>
				<div>
					<div class="agora-pp-name">${esc(hint?.displayName || 'Loading…')}</div>
					<div class="agora-pp-prof">${esc(hint?.professions?.[0]?.label || hint?.profession || 'Citizen')}</div>
				</div>
			</div>
			<div class="agora-pp-skel" aria-hidden="true">
				${'<div class="agora-pp-skel-row"></div>'.repeat(4)}
			</div>
			<div class="agora-pp-skel" aria-hidden="true" style="margin-top:18px">
				${'<div class="agora-pp-skel-line"></div>'.repeat(3)}
			</div>
			<span class="agora-pp-srhint" role="status">Loading passport…</span>`;
	}

	_renderError(id, detail) {
		this._bodyEl.innerHTML = `
			<div class="agora-pp-state">
				<div class="agora-pp-state-icon" aria-hidden="true">!</div>
				<p class="agora-pp-state-title">Couldn't load this passport</p>
				<p class="agora-pp-state-detail">${esc(detail)}</p>
				<button class="agora-pp-retry" type="button">Try again</button>
			</div>`;
		this._bodyEl.querySelector('.agora-pp-retry').addEventListener('click', () => this.open(id, { trigger: this._trigger }));
	}

	_render(data) {
		const c = data.citizen || {};
		const onchain = data.onchain || null;
		const accent = professionColor(c.profession || c.professions?.[0]?.key);
		this._titleEl.textContent = c.displayName || 'Passport';

		const status = onchain?.status || c.status || 'Idle';
		const reputation = onchain?.reputation ?? c.reputation ?? 0;
		const stake = onchain?.stakeAmount ?? c.stakeLamports;
		const professions = (c.professions && c.professions.length)
			? c.professions.map((p) => p.label)
			: [c.profession || 'Citizen'];

		const stats = [
			{ label: 'Reputation', value: Number(reputation).toLocaleString('en-US') },
			{ label: 'Tasks done', value: Number(c.tasksCompleted || 0).toLocaleString('en-US') },
			{ label: 'Earned', value: `${fmtThree(c.earnedThreeAtomic)} $THREE` },
			{ label: 'Stake', value: `${fmtSol(stake)} SOL` },
		];

		const identity = [];
		if (c.agenc?.registered && c.agenc?.cluster) identity.push(`AgenC · ${esc(c.agenc.cluster)}`);
		if (c.agenc?.identitySource) identity.push(esc(c.agenc.identitySource));

		this._bodyEl.innerHTML = `
			<div class="agora-pp-hero">
				<span class="agora-pp-dot" style="background:${accent}"></span>
				<div>
					<div class="agora-pp-name">${esc(c.displayName || 'Citizen')}</div>
					<div class="agora-pp-prof">${esc(professions.join(' · '))}</div>
				</div>
				<span class="agora-pp-status agora-pp-status-${esc(String(status).toLowerCase())}">${esc(status)}</span>
			</div>

			<div class="agora-pp-stats">
				${stats.map((s) => `
					<div class="agora-pp-stat">
						<div class="agora-pp-stat-value">${esc(s.value)}</div>
						<div class="agora-pp-stat-label">${esc(s.label)}</div>
					</div>`).join('')}
			</div>

			${identity.length ? `<div class="agora-pp-identity">${identity.map((i) => `<span class="agora-pp-chip">${i}</span>`).join('')}</div>` : ''}

			<h3 class="agora-pp-section">Recent activity</h3>
			${this._renderActivity(data.activity || [])}`;
	}

	_renderActivity(activity) {
		if (!activity.length) {
			return `<p class="agora-pp-empty">No on-chain activity yet. This citizen is just getting started in the Commons.</p>`;
		}
		return `<ul class="agora-pp-feed">${activity.slice(0, 12).map((a) => {
			const title = a.narrative || ACTIVITY_LABEL[a.kind] || a.kind;
			const meta = [a.rewardLabel, fmtTimeAgo(a.at)].filter(Boolean).join(' · ');
			const rep = (a.repBefore != null && a.repAfter != null && a.repBefore !== a.repAfter)
				? `<span class="agora-pp-rep">rep ${a.repBefore} → ${a.repAfter}</span>` : '';
			return `<li class="agora-pp-feed-item">
				<span class="agora-pp-feed-kind" data-kind="${esc(a.kind)}"></span>
				<div class="agora-pp-feed-main">
					<div class="agora-pp-feed-title">${esc(title)}</div>
					<div class="agora-pp-feed-meta">${esc(meta)} ${rep}</div>
				</div>
			</li>`;
		}).join('')}</ul>`;
	}

	dispose() {
		document.removeEventListener('keydown', this._onKey);
		this._el.remove();
	}
}
