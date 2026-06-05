// Site-wide notifications inbox: unread badge in the nav + a popover panel.
//
// Loaded by public/nav.js after the nav HTML is injected (so #nav-notifications-btn
// is guaranteed to exist). Auth-aware: silently skips polling when no session
// hint is found; shows a sign-in prompt when the panel is opened while logged out.
//
// All API calls are fire-and-forget with credentials: 'include'. A 401 just
// means the user is not signed in — the badge stays hidden.

const POLL_INTERVAL = 30_000;
const AUTH_HINT_KEY = '3dagent:auth-hint';

const TYPE_ICON = {
	skill_purchased:          '💵',
	skill_purchase_confirmed: '✅',
	asset_purchased:          '💵',
	asset_purchase_confirmed: '✅',
	asset_payment_mismatch:   '⚠️',
	skill_payment_mismatch:   '⚠️',
	referral_earned:          '💰',
	'payment-earned':         '💸',
	sale:                     '🛒',
	embed:                    '🔗',
	remix:                    '🔄',
	reply:                    '💬',
};

function notifLabel(n) {
	const p = n.payload || {};
	switch (n.type) {
		case 'skill_purchased':
			return `Payment received for skill "${p.skill || 'unknown'}"`;
		case 'skill_purchase_confirmed':
			return `Your purchase of "${p.skill || 'unknown'}" is confirmed`;
		case 'asset_purchased':
			return `Someone purchased your ${p.item_type || 'asset'}`;
		case 'asset_purchase_confirmed':
			return `Your asset purchase is confirmed`;
		case 'asset_payment_mismatch':
		case 'skill_payment_mismatch':
			return `Payment mismatch — check your agent settings`;
		case 'referral_earned':
			return `Referral commission earned`;
		case 'payment-earned':
			return `Payment received${p.actor ? ` from ${p.actor}` : ''}`;
		case 'sale':
			return `Your agent made a sale`;
		case 'embed':
			return `Your creation was embedded`;
		case 'remix':
			return `Someone remixed your creation`;
		case 'reply':
			return `New reply on your agent`;
		default:
			return n.type.replace(/_/g, ' ');
	}
}

function notifLink(n) {
	const p = n.payload || {};
	const raw = p.link
		|| (p.tx_signature ? `https://solscan.io/tx/${encodeURIComponent(p.tx_signature)}` : null)
		|| (p.agent_id ? `/agent/${encodeURIComponent(p.agent_id)}` : null);
	return safeNavUrl(raw);
}

// Permit only same-origin relative paths or absolute http(s) URLs. Anything
// else — javascript:, data:, vbscript:, or a protocol-relative //evil.com — is
// dropped, so a hostile notification payload can't drive navigation into a
// script execution or an off-site redirect.
function safeNavUrl(raw) {
	if (!raw || typeof raw !== 'string') return null;
	const s = raw.trim();
	if (s.startsWith('/') && !s.startsWith('//')) return s;
	if (/^https?:\/\//i.test(s)) return s;
	return null;
}

// HTML-escape untrusted notification text before it goes into innerHTML/attrs.
// Notification payloads carry other users' actor/skill/item names, so every
// interpolated value is treated as hostile.
function escNotif(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function relTime(dateStr) {
	const diff = Date.now() - new Date(dateStr).getTime();
	const m = Math.floor(diff / 60_000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

function isAuthed() {
	try {
		const raw = localStorage.getItem(AUTH_HINT_KEY);
		return raw ? JSON.parse(raw)?.authed === true : false;
	} catch { return false; }
}

class NotificationInbox {
	constructor(btn) {
		this._btn = btn;
		this._badge = btn.querySelector('.nav-notif-badge');
		this._panel = null;
		this._notifications = [];
		this._unread = 0;
		this._open = false;
		this._timer = null;

		btn.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(); });
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this._open) this._close();
		});
	}

	start() {
		if (!isAuthed()) return;
		this._poll();
		this._schedulePoll();
		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				clearTimeout(this._timer);
			} else {
				this._poll();
				this._schedulePoll();
			}
		});
	}

	_schedulePoll() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => {
			this._poll();
			this._schedulePoll();
		}, POLL_INTERVAL);
	}

	async _poll() {
		try {
			const resp = await fetch('/api/notifications?limit=20', { credentials: 'include' });
			if (!resp.ok) return;
			const data = await resp.json();
			this._notifications = data.notifications || [];
			this._unread = data.unread_count || 0;
			this._updateBadge();
			if (this._open) this._renderBody();
		} catch { /* network blip — silently ignore */ }
	}

	_updateBadge() {
		const badge = this._badge;
		if (!badge) return;
		if (this._unread > 0) {
			badge.textContent = this._unread > 99 ? '99+' : String(this._unread);
			badge.removeAttribute('hidden');
		} else {
			badge.setAttribute('hidden', '');
		}
		this._btn.setAttribute(
			'aria-label',
			this._unread > 0 ? `Notifications — ${this._unread} unread` : 'Notifications',
		);
		// aria-live on the badge for screen reader announcements
		badge.setAttribute('aria-live', 'polite');
	}

	_toggle() {
		this._open ? this._close() : this._openPanel();
	}

	_openPanel() {
		this._open = true;
		this._btn.setAttribute('aria-expanded', 'true');
		if (!this._panel) this._panel = this._buildPanel();
		document.body.appendChild(this._panel);
		this._positionPanel();

		if (isAuthed()) {
			this._renderBody();
			if (this._unread > 0) this._markAllRead();
		} else {
			this._renderLoggedOut();
		}

		// Close on outside click (deferred so the open click doesn't immediately close)
		setTimeout(() => {
			document.addEventListener('click', this._outsideHandler = (e) => {
				if (!this._panel?.contains(e.target) && e.target !== this._btn) this._close();
			}, { once: false });
		}, 0);
	}

	_close() {
		this._open = false;
		this._btn.setAttribute('aria-expanded', 'false');
		this._panel?.remove();
		if (this._outsideHandler) {
			document.removeEventListener('click', this._outsideHandler);
			this._outsideHandler = null;
		}
	}

	_buildPanel() {
		const el = document.createElement('div');
		el.className = 'notif-panel';
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', 'Notifications');
		el.setAttribute('aria-modal', 'false');
		el.innerHTML = `
			<div class="notif-panel-head">
				<span class="notif-panel-title">Notifications</span>
				<button type="button" class="notif-mark-all btn-ghost" aria-label="Mark all as read">Mark all read</button>
			</div>
			<div class="notif-panel-body" aria-live="polite" aria-atomic="false"></div>
		`;
		el.querySelector('.notif-mark-all').addEventListener('click', (e) => {
			e.stopPropagation();
			this._markAllRead();
		});
		return el;
	}

	_positionPanel() {
		if (!this._panel || !this._btn) return;
		const rect = this._btn.getBoundingClientRect();
		const W = 360;
		let left = rect.right - W;
		left = Math.max(8, Math.min(window.innerWidth - W - 8, left));
		this._panel.style.top = `${rect.bottom + 6}px`;
		this._panel.style.left = `${left}px`;
	}

	_renderBody() {
		const body = this._panel?.querySelector('.notif-panel-body');
		if (!body) return;

		if (!this._notifications.length) {
			body.innerHTML = `
				<div class="notif-empty">
					<div class="notif-empty-icon" aria-hidden="true">🔔</div>
					<div class="notif-empty-title">No notifications yet</div>
					<div class="notif-empty-sub">When your agent earns, sells, or gets remixed, you'll see it here.</div>
				</div>
			`;
			return;
		}

		body.innerHTML = this._notifications.map((n) => {
			const icon = TYPE_ICON[n.type] || '📣';
			const msg = notifLabel(n);
			const link = notifLink(n);
			const time = relTime(n.created_at);
			const unread = !n.read_at;
			return `
				<div class="notif-row${unread ? ' is-unread' : ''}"
				     data-id="${escNotif(n.id)}"
				     data-link="${escNotif(link || '')}"
				     tabindex="0"
				     role="button"
				     aria-label="${escNotif(msg)}${unread ? ' (unread)' : ''}">
					<span class="notif-type-icon" aria-hidden="true">${icon}</span>
					<div class="notif-row-body">
						<div class="notif-row-msg">${escNotif(msg)}</div>
						<div class="notif-row-time">${escNotif(time)}</div>
					</div>
					${unread ? '<span class="notif-unread-dot" aria-hidden="true"></span>' : ''}
				</div>
			`;
		}).join('');

		body.querySelectorAll('.notif-row').forEach((row) => {
			const activate = () => {
				const id = row.dataset.id;
				const link = row.dataset.link;
				if (id && row.classList.contains('is-unread')) this._markOneRead(id, row);
				if (link) {
					if (link.startsWith('http')) {
						window.open(link, '_blank', 'noopener');
					} else {
						window.location.href = link;
					}
				}
				this._close();
			};
			row.addEventListener('click', activate);
			row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
		});
	}

	_renderLoggedOut() {
		const body = this._panel?.querySelector('.notif-panel-body');
		if (!body) return;
		body.innerHTML = `
			<div class="notif-empty">
				<div class="notif-empty-icon" aria-hidden="true">🔔</div>
				<div class="notif-empty-title">Sign in to see your notifications</div>
				<div class="notif-empty-sub">Track payments, sales, and activity on your agents.</div>
				<a href="/login" class="notif-signin-btn">Sign in →</a>
			</div>
		`;
	}

	_markOneRead(id, rowEl) {
		const n = this._notifications.find((x) => x.id === id);
		if (!n || n.read_at) return;
		n.read_at = new Date().toISOString();
		this._unread = Math.max(0, this._unread - 1);
		this._updateBadge();
		rowEl?.classList.remove('is-unread');
		rowEl?.querySelector('.notif-unread-dot')?.remove();
		fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', credentials: 'include' }).catch(() => {});
	}

	async _markAllRead() {
		const markAllBtn = this._panel?.querySelector('.notif-mark-all');
		if (markAllBtn) { markAllBtn.disabled = true; markAllBtn.textContent = 'Done ✓'; }
		this._notifications.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
		this._unread = 0;
		this._updateBadge();
		this._renderBody();
		try {
			await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
		} catch { /* fire-and-forget */ }
	}
}

function mount() {
	const btn = document.getElementById('nav-notifications-btn');
	if (!btn) return;
	const inbox = new NotificationInbox(btn);
	inbox.start();
	window.__notifInbox = inbox;
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', mount);
} else {
	mount();
}
