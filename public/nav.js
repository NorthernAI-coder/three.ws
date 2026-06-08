// three.ws shared site navigation loader.
//
// Injects the global header (public/nav.html) into any page that includes a
// `<div id="nav-container"></div>` and `<script src="/nav.js">`, then wires the
// homepage nav behavior: hover/click dropdowns, the mobile drawer, the Walk
// Companion toggle, auth-aware CTAs, and active-page highlighting. The markup,
// styles (public/nav.css) and behavior here mirror pages/home.html so every
// page reads as the same site.

// Load the site-wide glossary tooltip system (public/glossary.js) on every
// page. Self-mounting + idempotent; honours <html data-glossary="off">.
function loadGlossary() {
	if (document.documentElement.getAttribute('data-glossary') === 'off') return;
	if (document.querySelector('script[src="/glossary.js"]')) return;
	const s = document.createElement('script');
	s.src = '/glossary.js';
	s.defer = true;
	document.head.appendChild(s);
}

// Load the site-wide Cmd-K command palette (public/search.js) on every page.
// Self-mounting + idempotent; honours <html data-search="off">.
function loadSearch() {
	if (document.documentElement.getAttribute('data-search') === 'off') return;
	if (document.querySelector('script[src="/search.js"]')) return;
	const s = document.createElement('script');
	s.src = '/search.js';
	s.defer = true;
	document.head.appendChild(s);
}

// Load the site-wide "Getting started" first-run guide (public/getting-started.js):
// a one-time welcome for new visitors plus a resumable progress checklist. Self-
// mounting + idempotent; honours <html data-getting-started="off">.
function loadGettingStarted() {
	if (document.documentElement.getAttribute('data-getting-started') === 'off') return;
	if (document.querySelector('script[src="/getting-started.js"]')) return;
	const s = document.createElement('script');
	s.src = '/getting-started.js';
	s.defer = true;
	document.head.appendChild(s);
}

// Load the per-user notifications inbox. Must run after nav HTML is injected
// because the module mounts onto #nav-notifications-btn which lives in nav.html.
function loadNotificationsInbox() {
	if (document.querySelector('script[src="/notifications.js"]')) return;
	const s = document.createElement('script');
	s.type = 'module';
	s.src = '/notifications.js';
	document.head.appendChild(s);
}

// Load the site-wide feature-discovery layer (public/feature-discovery.js):
// "New" badges, "have you tried…" prompts and contextual cross-links. Loaded
// after the glossary so it can reuse that tooltip primitive. Self-mounting +
// idempotent; honours <html data-discovery="off">.
function loadDiscovery() {
	if (document.documentElement.getAttribute('data-discovery') === 'off') return;
	if (document.querySelector('script[src="/feature-discovery.js"]')) return;
	const s = document.createElement('script');
	s.src = '/feature-discovery.js';
	s.defer = true;
	document.head.appendChild(s);
}

function boot() {
	loadGlossary();
	loadSearch();
	loadDiscovery();
	loadGettingStarted();
	const navContainer = document.getElementById('nav-container');
	if (!navContainer) return;
	if (!document.querySelector('link[href="/nav.css"]')) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = '/nav.css';
		document.head.appendChild(link);
	}
	fetch('/nav.html')
		.then((response) => response.text())
		.then((data) => {
			navContainer.innerHTML = data;
			initNav(navContainer);
			loadNotificationsInbox();
		})
		.catch(() => {});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot);
} else {
	boot();
}

function initNav(root) {
	initDropdowns(root);
	initDrawer(root);
	initWalkToggle(root);
	initAuthHint(root);
	initActivePage(root);
}

// ── Desktop dropdowns ──────────────────────────────────────────────────────
// Hover to open on pointer devices; click/keyboard for touch + accessibility.
function initDropdowns(root) {
	const groups = Array.prototype.slice.call(root.querySelectorAll('.nav-main .nav-grp'));
	if (!groups.length) return;
	const hoverCapable = window.matchMedia('(hover: hover)').matches;

	function setOpen(grp, on) {
		grp.classList.toggle('open', on);
		const t = grp.querySelector('.nav-trigger');
		if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
	}
	function closeAll(except) {
		groups.forEach((g) => {
			if (g !== except) setOpen(g, false);
		});
	}

	groups.forEach((grp) => {
		const trigger = grp.querySelector('.nav-trigger');
		if (!trigger) return;
		let closeTimer;

		trigger.addEventListener('click', (e) => {
			e.stopPropagation();
			if (hoverCapable) {
				// hover already opens it; a click just pins it open
				closeAll(grp);
				setOpen(grp, true);
				return;
			}
			const willOpen = !grp.classList.contains('open');
			closeAll(grp);
			setOpen(grp, willOpen);
		});

		if (hoverCapable) {
			grp.addEventListener('mouseenter', () => {
				clearTimeout(closeTimer);
				closeAll(grp);
				setOpen(grp, true);
			});
			grp.addEventListener('mouseleave', () => {
				closeTimer = setTimeout(() => setOpen(grp, false), 120);
			});
		}

		// Keyboard navigation within the open menu.
		const menu = trigger.nextElementSibling;
		if (menu) {
			menu.addEventListener('keydown', (e) => {
				const items = Array.prototype.slice.call(menu.querySelectorAll('a'));
				const idx = items.indexOf(document.activeElement);
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					(items[(idx + 1) % items.length] || items[0])?.focus({ preventScroll: true });
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					(items[(idx - 1 + items.length) % items.length] || items[0])?.focus({
						preventScroll: true,
					});
				} else if (e.key === 'Escape') {
					setOpen(grp, false);
					trigger.focus({ preventScroll: true });
				}
			});
		}

		grp.querySelectorAll('.nav-mi').forEach((a) => {
			a.addEventListener('click', () => setOpen(grp, false));
		});
	});

	document.addEventListener('click', (e) => {
		if (!e.target.closest('.nav-main .nav-grp')) closeAll(null);
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			const openGrp = root.querySelector('.nav-main .nav-grp.open');
			if (openGrp) {
				setOpen(openGrp, false);
				const t = openGrp.querySelector('.nav-trigger');
				if (t) t.focus({ preventScroll: true });
			}
		}
	});
}

// ── Mobile drawer ──────────────────────────────────────────────────────────
function initDrawer(root) {
	const toggle = root.querySelector('#nav-toggle');
	const drawer = root.querySelector('#nav-drawer');
	if (!toggle || !drawer) return;

	const isOpen = () => drawer.classList.contains('open');
	function setOpen(open) {
		toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
		document.body.style.overflow = open ? 'hidden' : '';
		drawer.classList.toggle('open', open);
	}
	toggle.addEventListener('click', () => setOpen(!isOpen()));
	drawer.addEventListener('click', (e) => {
		if (e.target.closest('a')) setOpen(false);
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isOpen()) {
			setOpen(false);
			toggle.focus();
		}
	});
	window.addEventListener('resize', () => {
		if (window.innerWidth > 880 && isOpen()) setOpen(false);
	});
}

// ── Active page highlighting ────────────────────────────────────────────────
function initActivePage(root) {
	const path = location.pathname.replace(/\/$/, '') || '/';
	root.querySelectorAll('a[href]').forEach((a) => {
		const raw = a.getAttribute('href');
		if (!raw || !raw.startsWith('/')) return;
		const href = raw.split('#')[0].replace(/\/$/, '') || '/';
		if (href === path || (href !== '/' && path.startsWith(href + '/'))) {
			a.setAttribute('aria-current', 'page');
		}
	});
}

// ── Auth-aware CTAs ──────────────────────────────────────────────────────────
// Swap "Sign in" for the dashboard / My Agents entry points when the visitor is
// authenticated. The behavior lives in the shared /nav-auth.js module so the
// hand-rolled homepage nav and this shared nav stay in lock-step — see that file
// for the hint-then-reconcile-against-/api/auth/me strategy and its data-auth
// markup contract. Loaded on demand and called once the nav markup is injected.
function initAuthHint(root) {
	if (typeof window.initNavAuth === 'function') {
		window.initNavAuth(root);
		return;
	}
	if (!document.querySelector('script[src="/nav-auth.js"]')) {
		const s = document.createElement('script');
		s.src = '/nav-auth.js';
		s.addEventListener('load', () => {
			if (typeof window.initNavAuth === 'function') window.initNavAuth(root);
		});
		document.head.appendChild(s);
	} else {
		// Script tag exists but hasn't finished loading yet — run once it does.
		const existing = document.querySelector('script[src="/nav-auth.js"]');
		existing.addEventListener('load', () => {
			if (typeof window.initNavAuth === 'function') window.initNavAuth(root);
		});
	}
}

// ── Walk Companion toggle ─────────────────────────────────────────────────────
// Loads the stable, unhashed /walk-companion.js module (built from
// src/walk-companion.js — see vite.config.js) only when enabled, so pages pay
// no Three.js cost when it's off. State lives in localStorage and the
// ?walk=1 / ?walk=0 query param, both also honored by the module itself.
const WALK_ENABLED_KEY = 'walk:companion:enabled';

function walkIsEnabled() {
	try {
		return localStorage.getItem(WALK_ENABLED_KEY) === '1';
	} catch (_) {
		return false;
	}
}

function ensureWalkCompanion() {
	if (document.querySelector('script[src="/walk-companion.js"]')) return;
	const s = document.createElement('script');
	s.type = 'module';
	s.src = '/walk-companion.js';
	document.head.appendChild(s);
}

function initWalkToggle(root) {
	const btn = root.querySelector('#home-nav-walk');
	if (!btn) return;

	const params = new URLSearchParams(location.search);
	const override = params.get('walk');

	function sync() {
		const on = walkIsEnabled();
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		btn.classList.toggle('is-on', on);
	}

	// An explicit ?walk= override decides the initial state; otherwise restore.
	if (override === '1' || override === '0') {
		try {
			localStorage.setItem(WALK_ENABLED_KEY, override);
		} catch (_) {}
	}
	sync();

	// Load the module if the companion should be active on this page. The module
	// is self-mounting; ensureWalkCompanion is idempotent.
	if (override === '1' || (override !== '0' && walkIsEnabled())) {
		ensureWalkCompanion();
	}

	btn.addEventListener('click', () => {
		if (window.__walkCompanion) {
			window.__walkCompanion.toggle();
		} else {
			try {
				localStorage.setItem(WALK_ENABLED_KEY, '1');
			} catch (_) {}
			ensureWalkCompanion();
		}
		sync();
	});

	window.addEventListener('walk-companion:change', sync);
}
