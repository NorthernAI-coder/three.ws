// dashboard-next — topbar (breadcrumb + search + notifications + user menu).
//
// The search button is the click-handle for the command palette (⌘K).
// The drawer toggle controls the right-hand activity rail.
// The notification bell shows unread count and opens a dropdown.
// The user chip opens a popover with wallet address, email, quick links.

import { currentRoute } from '../nav.js';
import { esc, getMe, initialsOf } from '../api.js';

const DRAWER_KEY = 'dn:drawer:open';

export function renderTopbar(pathname) {
	const here = currentRoute(pathname);
	const crumb = here?.label || 'Dashboard';
	return `
		<header class="dn-topbar" data-component="topbar">
			<div class="dn-topbar-crumb">
				<span>Dashboard</span>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 2l4 4-4 4"/></svg>
				<strong>${esc(crumb)}</strong>
			</div>
			<div class="dn-topbar-spacer"></div>
			<button type="button" class="dn-topbar-search" data-action="open-palette" aria-label="Open command palette">
				<span style="display:inline-flex;align-items:center;gap:8px">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.6-2.6"/></svg>
					Search or jump to…
				</span>
				<kbd>⌘K</kbd>
			</button>
			<button type="button" class="dn-topbar-btn" data-action="toggle-notifs" aria-label="Notifications" aria-haspopup="menu" aria-expanded="false" style="position:relative">
				<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a6 6 0 016 6v3l1.5 2.5H2.5L4 11V8a6 6 0 016-6z"/><path d="M8 17a2 2 0 004 0"/></svg>
				<span data-slot="notif-badge" style="
					display:none;position:absolute;top:2px;right:2px;
					min-width:16px;height:16px;border-radius:8px;padding:0 4px;
					background:var(--nxt-danger,#e55);color:#fff;
					font-size:10px;font-weight:700;line-height:16px;text-align:center;
				"></span>
			</button>
			<button type="button" class="dn-topbar-btn" data-action="toggle-drawer" aria-label="Toggle activity drawer" aria-pressed="false">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
			</button>
			<div class="dn-walk-avatar" data-component="walk-avatar" data-state="loading">
				<button type="button" class="dn-walk-avatar-btn" data-action="toggle-walk-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Your walking avatar">
					<span class="dn-walk-avatar-stage" data-slot="walk-stage" aria-hidden="true">
						<span class="dn-walk-avatar-skel"></span>
					</span>
				</button>
			</div>
			<button type="button" class="dn-topbar-user" data-action="toggle-user-menu" data-component="topbar-user" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu">
				<span class="dn-topbar-user-avatar" data-slot="initials" aria-hidden="true">··</span>
				<span data-slot="label">Loading…</span>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>
			</button>
		</header>`;
}

/** Wire drawer toggle, palette opener, notifications, and user menu. */
export function mountTopbarBehavior(shellEl) {
	const drawerOpen = (() => {
		try { return localStorage.getItem(DRAWER_KEY) === '1'; }
		catch { return false; }
	})();
	setDrawerOpen(shellEl, drawerOpen);

	shellEl.addEventListener('click', (e) => {
		if (e.target.closest?.('[data-action="open-palette"]')) {
			window.dispatchEvent(new CustomEvent('dn:palette:open'));
			return;
		}
		if (e.target.closest?.('[data-action="toggle-drawer"]')) {
			const next = shellEl.getAttribute('data-drawer-open') !== 'true';
			setDrawerOpen(shellEl, next);
			try { localStorage.setItem(DRAWER_KEY, next ? '1' : '0'); }
			catch { /* private mode */ }
			return;
		}
		if (e.target.closest?.('[data-action="toggle-notifs"]')) {
			const btn = e.target.closest('[data-action="toggle-notifs"]');
			toggleNotifsDropdown(btn);
			return;
		}
		if (e.target.closest?.('[data-action="toggle-user-menu"]')) {
			const chip = e.target.closest('[data-action="toggle-user-menu"]');
			toggleUserMenu(chip);
			return;
		}
		if (e.target.closest?.('[data-action="toggle-walk-menu"]')) {
			const btn = e.target.closest('[data-action="toggle-walk-menu"]');
			toggleWalkMenu(btn);
			return;
		}
	});

	window.addEventListener('keydown', (e) => {
		if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
			e.preventDefault();
			window.dispatchEvent(new CustomEvent('dn:palette:open'));
		}
	});

	injectTopbarStyles();

	// Fill the user chip and load notification count from /api/auth/me.
	getMe().then((me) => {
		const chip = shellEl.querySelector('[data-component="topbar-user"]');
		if (!chip) return;
		if (!me) {
			chip.querySelector('[data-slot="label"]').textContent = 'Sign in';
			chip.querySelector('[data-slot="initials"]').textContent = '?';
			chip.dataset.action = 'sign-in';
			chip.onclick = () => {
				const ret = encodeURIComponent(location.pathname + location.search);
				location.href = `/login?return=${ret}`;
			};
			// No session → hide the walking avatar entirely; it's account-bound.
			const walk = shellEl.querySelector('[data-component="walk-avatar"]');
			if (walk) walk.style.display = 'none';
			return;
		}
		chip.querySelector('[data-slot="initials"]').textContent = initialsOf(me);
		const label = me.display_name || me.handle || me.email || 'Account';
		chip.querySelector('[data-slot="label"]').textContent = String(label).slice(0, 18);
		chip.dataset.me = JSON.stringify({
			display_name: me.display_name,
			handle: me.handle,
			email: me.email,
			wallet: me.wallet_address || me.solana_address || '',
			plan: me.plan || 'free',
		});

		// Load unread notification count in background — only once we know the
		// visitor is signed in, so anonymous sessions don't collect 401s.
		// The real endpoint (api/notifications/index.js) returns `unread_count`.
		fetch('/api/notifications?limit=1', { credentials: 'include' })
			.then((r) => r.ok ? r.json() : null)
			.then((data) => {
				const unread = data?.unread_count ?? 0;
				const badge = shellEl.querySelector('[data-slot="notif-badge"]');
				if (badge) {
					if (unread > 0) {
						badge.style.display = 'block';
						badge.textContent = unread > 9 ? '9+' : String(unread);
					} else {
						badge.style.display = 'none';
						badge.textContent = '';
					}
				}
				// A fresh notification makes the topbar avatar wave so the user
				// notices without watching the bell.
				if (unread > 0) signalWalkAvatar(shellEl, 'wave');
			})
			.catch(() => { /* notifications unavailable */ });

		// Bring the user's own avatar to life in the topbar.
		mountWalkAvatar(shellEl);
	}).catch(() => { /* network blip — chip stays "Loading…" */ });
}

function setDrawerOpen(shellEl, open) {
	shellEl.setAttribute('data-drawer-open', open ? 'true' : 'false');
	const btn = shellEl.querySelector('[data-action="toggle-drawer"]');
	if (btn) btn.setAttribute('aria-pressed', open ? 'true' : 'false');
	window.dispatchEvent(new CustomEvent('dn:drawer:toggled', { detail: { open } }));
}

// ── Notifications dropdown ─────────────────────────────────────────────────

function toggleNotifsDropdown(btn) {
	const existing = document.querySelector('[data-topbar-notifs]');
	if (existing) { closeNotifsDropdown(existing, btn); return; }

	const rect = btn.getBoundingClientRect();
	const drop = document.createElement('div');
	drop.setAttribute('data-topbar-notifs', '');
	drop.setAttribute('role', 'dialog');
	drop.setAttribute('aria-label', 'Notifications');
	btn.setAttribute('aria-expanded', 'true');
	drop.style.cssText = `
		position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
		width:320px;max-height:420px;overflow-y:auto;
		background:rgba(18,20,28,0.97);border:1px solid var(--nxt-stroke-strong);
		border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.6);
		backdrop-filter:blur(20px);z-index:2000;
	`;
	drop.innerHTML = `
		<div style="padding:12px 16px;border-bottom:1px solid var(--nxt-stroke);display:flex;align-items:center;justify-content:space-between">
			<span style="font-size:13.5px;font-weight:600">Notifications</span>
			<a href="/dashboard/settings" style="font-size:12px;color:var(--nxt-accent)">Settings →</a>
		</div>
		<div data-slot="notif-items" style="padding:8px 0">
			<div style="padding:14px 16px;color:var(--nxt-ink-dim);font-size:13px">Loading…</div>
		</div>
	`;
	document.body.appendChild(drop);

	const closeOnOutside = (e) => {
		if (!drop.contains(e.target) && e.target !== btn) {
			closeNotifsDropdown(drop, btn, closeOnOutside, onKey);
		}
	};
	const onKey = (e) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			closeNotifsDropdown(drop, btn, closeOnOutside, onKey);
			btn.focus();
		}
	};
	setTimeout(() => {
		document.addEventListener('click', closeOnOutside, true);
		document.addEventListener('keydown', onKey, true);
	}, 0);

	fetch('/api/notifications?limit=10', { credentials: 'include' })
		.then((r) => r.ok ? r.json() : null)
		.then((data) => {
			const items = data?.notifications || [];
			const host = drop.querySelector('[data-slot="notif-items"]');
			if (!items.length) {
				host.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--nxt-ink-dim);font-size:13px">No notifications</div>`;
				return;
			}
			host.innerHTML = items.map((n) => `
				<div style="padding:10px 16px;border-bottom:1px solid var(--nxt-stroke);opacity:${n.read_at ? '0.6' : '1'}">
					<div style="font-size:13px;font-weight:${n.read_at ? '400' : '500'};color:var(--nxt-ink)">${esc(n.title || n.message || 'Notification')}</div>
					${n.body ? `<div style="font-size:12px;color:var(--nxt-ink-dim);margin-top:2px">${esc(n.body.slice(0, 100))}</div>` : ''}
					<div style="font-size:11.5px;color:var(--nxt-ink-fade);margin-top:3px">${n.created_at ? timeAgo(n.created_at) : ''}</div>
				</div>
			`).join('');
		})
		.catch(() => {
			const host = drop.querySelector('[data-slot="notif-items"]');
			host.innerHTML = `<div style="padding:14px 16px;color:var(--nxt-ink-dim);font-size:13px">Couldn't load notifications.</div>`;
		});
}

function closeNotifsDropdown(drop, btn, onOutside, onKey) {
	drop.remove();
	if (btn) btn.setAttribute('aria-expanded', 'false');
	if (onOutside) document.removeEventListener('click', onOutside, true);
	if (onKey) document.removeEventListener('keydown', onKey, true);
}

// ── User menu popover ──────────────────────────────────────────────────────

function toggleUserMenu(chip) {
	const existing = document.querySelector('[data-topbar-user-menu]');
	if (existing) { closeUserMenu(existing, chip); return; }

	const rect = chip.getBoundingClientRect();
	const rawMe = chip.dataset.me ? JSON.parse(chip.dataset.me) : {};

	chip.setAttribute('aria-expanded', 'true');
	const menu = document.createElement('div');
	menu.setAttribute('data-topbar-user-menu', '');
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', 'Account menu');
	menu.style.cssText = `
		position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
		min-width:240px;
		background:rgba(18,20,28,0.97);border:1px solid var(--nxt-stroke-strong);
		border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.6);
		backdrop-filter:blur(20px);z-index:2000;overflow:hidden;
	`;

	const wallet = rawMe.wallet || '';
	const email = rawMe.email || '';
	const name = rawMe.display_name || rawMe.handle || email || 'Account';
	const plan = rawMe.plan || 'free';

	menu.innerHTML = `
		<div style="padding:14px 16px;border-bottom:1px solid var(--nxt-stroke)">
			<div style="font-size:14px;font-weight:600;color:var(--nxt-ink);margin-bottom:2px">${esc(name)}</div>
			${email ? `<div style="font-size:12px;color:var(--nxt-ink-dim)">${esc(email)}</div>` : ''}
			${wallet ? `<div style="font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--nxt-ink-fade);margin-top:3px">${esc(wallet.slice(0, 8))}…${esc(wallet.slice(-6))}</div>` : ''}
			<div style="margin-top:6px"><span class="dn-tag" style="font-size:11px;text-transform:capitalize">${esc(plan)}</span></div>
		</div>
		<div style="padding:6px 0">
			<a href="/dashboard/portfolio" class="dn-user-menu-item" role="menuitem">Portfolio & NFTs</a>
			<a href="/dashboard/account" class="dn-user-menu-item" role="menuitem">Account</a>
			<a href="/dashboard/settings" class="dn-user-menu-item" role="menuitem">Settings</a>
			${wallet ? `<button type="button" role="menuitem" class="dn-user-menu-item" data-action="copy-wallet" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;color:inherit">Copy wallet address</button>` : ''}
			${email ? `<button type="button" role="menuitem" class="dn-user-menu-item" data-action="copy-email" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;color:inherit">Copy email</button>` : ''}
		</div>
		<div style="padding:6px 0;border-top:1px solid var(--nxt-stroke)">
			<button type="button" role="menuitem" class="dn-user-menu-item danger" data-action="sign-out" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">Sign out</button>
		</div>
	`;

	injectMenuStyles();
	document.body.appendChild(menu);
	// Move focus into the menu so keyboard users land on the first item.
	requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());

	menu.querySelector('[data-action="copy-wallet"]')?.addEventListener('click', async () => {
		try { await navigator.clipboard.writeText(wallet); } catch { /* ignore */ }
		closeUserMenu(menu, chip, closeOnOutside, onKey);
	});
	menu.querySelector('[data-action="copy-email"]')?.addEventListener('click', async () => {
		try { await navigator.clipboard.writeText(email); } catch { /* ignore */ }
		closeUserMenu(menu, chip, closeOnOutside, onKey);
	});
	menu.querySelector('[data-action="sign-out"]')?.addEventListener('click', async () => {
		closeUserMenu(menu, chip, closeOnOutside, onKey);
		try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); }
		catch { /* best effort */ }
		location.href = '/';
	});

	const closeOnOutside = (e) => {
		if (!menu.contains(e.target) && !chip.contains(e.target)) {
			closeUserMenu(menu, chip, closeOnOutside, onKey);
		}
	};
	// Keyboard: Escape closes (focus returns to the chip); arrow keys roam items.
	const onKey = (e) => {
		const items = [...menu.querySelectorAll('[role="menuitem"]')];
		if (e.key === 'Escape') {
			e.stopPropagation();
			closeUserMenu(menu, chip, closeOnOutside, onKey);
			chip.focus();
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = items.indexOf(document.activeElement);
			const next = e.key === 'ArrowDown'
				? (idx + 1) % items.length
				: (idx - 1 + items.length) % items.length;
			items[next]?.focus();
		}
	};
	setTimeout(() => {
		document.addEventListener('click', closeOnOutside, true);
		document.addEventListener('keydown', onKey, true);
	}, 0);
}

function closeUserMenu(menu, chip, onOutside, onKey) {
	menu.remove();
	if (chip) chip.setAttribute('aria-expanded', 'false');
	if (onOutside) document.removeEventListener('click', onOutside, true);
	if (onKey) document.removeEventListener('keydown', onKey, true);
}

// ── Walking avatar (topbar live status) ────────────────────────────────────
//
// A compact (~64×80) live walking avatar driven by the signed-in user's own
// avatar. We render it through the chrome-less /walk-embed route in an iframe
// (controls=none, autoplay, transparent bg, no orbit). The iframe is only
// created once the avatar scrolls/exists in the viewport (lazy) so it never
// taxes a dashboard the user can't see. States: loading → walking | empty |
// error. A fresh notification makes it wave.

let _walkAvatar = null; // { id, name, handle } once resolved

function mountWalkAvatar(shellEl) {
	const host = shellEl.querySelector('[data-component="walk-avatar"]');
	if (!host || host.dataset.mounted === '1') return;
	host.dataset.mounted = '1';

	// Real data: the caller's own avatars. The first (most recent) is their
	// primary; the picker endpoint already returns them newest-first.
	fetch('/api/avatars/mine?limit=1', { credentials: 'include' })
		.then((r) => (r.ok ? r.json() : null))
		.then((data) => {
			const av = data?.avatars?.[0];
			if (!av) {
				renderWalkEmptyState(host);
				return;
			}
			_walkAvatar = {
				id: av.id,
				name: av.name || 'Your avatar',
				handle: av.slug || null,
			};
			renderWalkLiveState(host, _walkAvatar);
		})
		.catch(() => renderWalkErrorState(host));
}

// Empty: the user hasn't made an avatar yet. A subtle, inviting affordance that
// links straight into the avatar creator — not a broken frame.
function renderWalkEmptyState(host) {
	host.dataset.state = 'empty';
	const stage = host.querySelector('[data-slot="walk-stage"]');
	if (stage) stage.innerHTML = '';
	const btn = host.querySelector('[data-action="toggle-walk-menu"]');
	if (!btn) return;
	btn.dataset.action = 'create-avatar';
	btn.setAttribute('aria-label', 'Create your avatar');
	btn.setAttribute('title', 'Create your avatar');
	btn.removeAttribute('aria-haspopup');
	btn.removeAttribute('aria-expanded');
	host.querySelector('[data-slot="walk-stage"]').innerHTML = `
		<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="8" r="3.2"/>
			<path d="M5.5 20a6.5 6.5 0 0113 0"/>
			<path d="M19 4v4M21 6h-4"/>
		</svg>`;
	btn.onclick = () => { location.href = '/create'; };
}

// Error: avatar lookup failed (network). Offer a retry rather than a dead frame.
function renderWalkErrorState(host) {
	host.dataset.state = 'error';
	const btn = host.querySelector('[data-action="toggle-walk-menu"]');
	if (!btn) return;
	btn.dataset.action = 'retry-walk';
	btn.setAttribute('aria-label', 'Avatar failed to load — retry');
	btn.setAttribute('title', 'Retry');
	btn.removeAttribute('aria-haspopup');
	btn.removeAttribute('aria-expanded');
	host.querySelector('[data-slot="walk-stage"]').innerHTML = `
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M20 11A8 8 0 105 5.5"/><path d="M4 4v4h4"/>
		</svg>`;
	btn.onclick = () => {
		host.dataset.state = 'loading';
		host.dataset.mounted = '0';
		btn.onclick = null;
		btn.dataset.action = 'toggle-walk-menu';
		host.querySelector('[data-slot="walk-stage"]').innerHTML = '<span class="dn-walk-avatar-skel"></span>';
		const shellEl = host.closest('.dn-shell') || document;
		mountWalkAvatar(shellEl);
	};
}

// Live: lazily mount the /walk-embed iframe of the user's avatar, walking.
function renderWalkLiveState(host, avatar) {
	host.dataset.state = 'live';
	const btn = host.querySelector('[data-action="toggle-walk-menu"]');
	if (btn) {
		btn.setAttribute('aria-label', `${avatar.name} — open avatar menu`);
		btn.setAttribute('title', avatar.name);
		btn.setAttribute('aria-haspopup', 'menu');
		btn.setAttribute('aria-expanded', 'false');
	}

	const mountFrame = () => {
		if (host.dataset.framed === '1') return;
		host.dataset.framed = '1';
		const stage = host.querySelector('[data-slot="walk-stage"]');
		if (!stage) return;
		const qs = new URLSearchParams({
			avatar: avatar.id,
			controls: 'none',
			autoplay: 'true',
			bg: 'transparent',
			orbit: 'false',
			ground: 'false',
		});
		const frame = document.createElement('iframe');
		frame.className = 'dn-walk-avatar-frame';
		frame.title = `${avatar.name}, walking`;
		frame.setAttribute('aria-hidden', 'true');
		frame.setAttribute('tabindex', '-1');
		frame.loading = 'lazy';
		frame.allowTransparency = 'true';
		frame.src = `/walk-embed?${qs.toString()}`;

		// Reveal only once the embed reports the avatar is loaded AND animating.
		// The iframe's DOM `load` event fires far earlier — the document is parsed
		// before the GLB and walk clips resolve (those load async). Revealing on it
		// exposed the bare frame mid-load: a white pre-paint flash, then the model
		// frozen in its bind-pose T-pose, before the walk clip applied. We instead
		// hold the dark skeleton until the embed posts `walk:ready` over the
		// three-walk channel, which fires only after it crossfades into motion.
		let revealed = false;
		const reveal = () => {
			if (revealed) return;
			revealed = true;
			host.dataset.ready = '1';
			frame.classList.add('is-ready');
			const skel = stage.querySelector('.dn-walk-avatar-skel');
			if (skel) skel.remove();
			window.removeEventListener('message', onReady);
			clearTimeout(failsafe);
		};
		function onReady(e) {
			if (e.source !== frame.contentWindow) return;
			const d = e.data;
			if (d && d.type === 'walk:ready') reveal();
		}
		window.addEventListener('message', onReady);
		// `walk:ready` is a one-shot — a host that finishes wiring after the embed
		// already loaded would miss it. Ping on DOM load so the embed re-emits it.
		frame.addEventListener('load', () => {
			try {
				frame.contentWindow?.postMessage({ channel: 'three-walk', v: 1, type: 'walk:ping' }, '*');
			} catch (_) {}
		});
		// Failsafe: never strand the skeleton if the ready signal is lost (embed
		// error, blocked message). Reveal anyway after a generous window.
		const failsafe = setTimeout(reveal, 8000);

		stage.appendChild(frame);
	};

	// Lazy: only build the iframe when the topbar avatar is on-screen. The
	// dashboard topbar is essentially always visible, but this keeps the
	// embed off the critical path and respects reduced-data scenarios.
	if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries, obs) => {
			if (entries.some((e) => e.isIntersecting)) {
				obs.disconnect();
				mountFrame();
			}
		}, { rootMargin: '120px' });
		io.observe(host);
	} else {
		mountFrame();
	}
}

// Tell the embedded avatar to play a one-shot gesture (e.g. wave on a fresh
// notification). Waits for the iframe to exist; the embed ignores commands it
// can't honor, so this is safe to fire optimistically.
function signalWalkAvatar(shellEl, gesture) {
	const host = shellEl.querySelector('[data-component="walk-avatar"]');
	const frame = host?.querySelector('iframe.dn-walk-avatar-frame');
	if (!frame?.contentWindow) {
		// Frame not built yet — retry shortly, but give up after a few tries
		// so we never leave a dangling timer.
		let tries = 0;
		const t = setInterval(() => {
			tries += 1;
			const f = shellEl.querySelector('iframe.dn-walk-avatar-frame');
			if (f?.contentWindow) {
				clearInterval(t);
				f.contentWindow.postMessage({ type: 'walk:gesture', gesture }, '*');
			} else if (tries >= 10) {
				clearInterval(t);
			}
		}, 600);
		return;
	}
	frame.contentWindow.postMessage({ type: 'walk:gesture', gesture }, '*');
}

// Dropdown: name + handle, Open Walk, Edit Avatar.
function toggleWalkMenu(btn) {
	const existing = document.querySelector('[data-topbar-walk-menu]');
	if (existing) { closeWalkMenu(existing, btn); return; }
	if (!_walkAvatar) return;

	const rect = btn.getBoundingClientRect();
	btn.setAttribute('aria-expanded', 'true');
	const menu = document.createElement('div');
	menu.setAttribute('data-topbar-walk-menu', '');
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', 'Avatar menu');
	menu.style.cssText = `
		position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
		min-width:220px;
		background:rgba(18,20,28,0.97);border:1px solid var(--nxt-stroke-strong);
		border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.6);
		backdrop-filter:blur(20px);z-index:2000;overflow:hidden;
	`;
	const handle = _walkAvatar.handle ? `@${_walkAvatar.handle}` : '';
	menu.innerHTML = `
		<div style="padding:14px 16px;border-bottom:1px solid var(--nxt-stroke)">
			<div style="font-size:14px;font-weight:600;color:var(--nxt-ink)">${esc(_walkAvatar.name)}</div>
			${handle ? `<div style="font-size:12px;color:var(--nxt-ink-dim);margin-top:2px">${esc(handle)}</div>` : ''}
		</div>
		<div style="padding:6px 0">
			<a href="/walk/app?avatar=${encodeURIComponent(_walkAvatar.id)}" class="dn-user-menu-item" role="menuitem">Open Walk</a>
			<a href="/avatars/${encodeURIComponent(_walkAvatar.id)}/edit" class="dn-user-menu-item" role="menuitem">Edit Avatar</a>
		</div>
	`;

	injectMenuStyles();
	document.body.appendChild(menu);
	requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());

	const closeOnOutside = (e) => {
		if (!menu.contains(e.target) && !btn.contains(e.target)) {
			closeWalkMenu(menu, btn, closeOnOutside, onKey);
		}
	};
	const onKey = (e) => {
		const items = [...menu.querySelectorAll('[role="menuitem"]')];
		if (e.key === 'Escape') {
			e.stopPropagation();
			closeWalkMenu(menu, btn, closeOnOutside, onKey);
			btn.focus();
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = items.indexOf(document.activeElement);
			const next = e.key === 'ArrowDown'
				? (idx + 1) % items.length
				: (idx - 1 + items.length) % items.length;
			items[next]?.focus();
		}
	};
	setTimeout(() => {
		document.addEventListener('click', closeOnOutside, true);
		document.addEventListener('keydown', onKey, true);
	}, 0);
}

function closeWalkMenu(menu, btn, onOutside, onKey) {
	menu.remove();
	if (btn) btn.setAttribute('aria-expanded', 'false');
	if (onOutside) document.removeEventListener('click', onOutside, true);
	if (onKey) document.removeEventListener('keydown', onKey, true);
}

let _topbarStylesInjected = false;
function injectTopbarStyles() {
	if (_topbarStylesInjected) return;
	_topbarStylesInjected = true;
	const style = document.createElement('style');
	style.textContent = `
		.dn-walk-avatar { display:flex; align-items:center; }
		.dn-walk-avatar-btn {
			display:inline-flex; align-items:center; justify-content:center;
			width:64px; height:80px; padding:0; margin:0;
			background:var(--nxt-surface-1, rgba(255,255,255,0.03));
			border:1px solid var(--nxt-stroke); border-radius:14px;
			color:var(--nxt-ink-dim); cursor:pointer;
			overflow:hidden; position:relative;
			transition:border-color 140ms ease, background 140ms ease, transform 120ms ease;
		}
		.dn-walk-avatar-btn:hover { border-color:var(--nxt-stroke-strong); background:rgba(255,255,255,0.05); color:var(--nxt-ink); }
		.dn-walk-avatar-btn:active { transform:scale(0.97); }
		.dn-walk-avatar-btn:focus-visible {
			outline:2px solid var(--nxt-accent, #fff); outline-offset:2px;
		}
		.dn-walk-avatar-stage {
			display:flex; align-items:center; justify-content:center;
			width:100%; height:100%; position:relative;
		}
		.dn-walk-avatar-frame {
			width:100%; height:100%; border:0; display:block;
			background:transparent; pointer-events:none;
			opacity:0; transition:opacity 240ms ease;
		}
		.dn-walk-avatar-frame.is-ready { opacity:1; }
		.dn-walk-avatar-skel {
			position:absolute; inset:8px; border-radius:10px;
			background:linear-gradient(100deg,
				rgba(255,255,255,0.04) 30%,
				rgba(255,255,255,0.09) 50%,
				rgba(255,255,255,0.04) 70%);
			background-size:200% 100%;
			animation:dn-walk-skel 1.3s ease-in-out infinite;
		}
		.dn-walk-avatar[data-state="empty"] .dn-walk-avatar-btn,
		.dn-walk-avatar[data-state="error"] .dn-walk-avatar-btn {
			border-style:dashed;
		}
		@keyframes dn-walk-skel {
			0% { background-position:200% 0; }
			100% { background-position:-200% 0; }
		}
		/* Narrow viewports: shrink, then hide before the topbar crowds. */
		@media (max-width: 860px) {
			.dn-walk-avatar-btn { width:52px; height:64px; }
		}
		@media (max-width: 640px) {
			.dn-walk-avatar { display:none; }
		}
		@media (prefers-reduced-motion: reduce) {
			.dn-walk-avatar-skel { animation:none; }
			.dn-walk-avatar-frame { transition:none; }
			.dn-walk-avatar-btn:active { transform:none; }
		}
	`;
	document.head.appendChild(style);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso) {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60_000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

let _menuStylesInjected = false;
function injectMenuStyles() {
	if (_menuStylesInjected) return;
	_menuStylesInjected = true;
	const style = document.createElement('style');
	style.textContent = `
		.dn-user-menu-item {
			display:block;padding:9px 16px;font-size:13px;color:var(--nxt-ink);
			text-decoration:none;transition:background 0.12s;font-family:inherit;
		}
		.dn-user-menu-item:hover { background:rgba(255,255,255,0.06); }
		.dn-user-menu-item.danger { color:var(--nxt-danger,#e55); }
	`;
	document.head.appendChild(style);
}
