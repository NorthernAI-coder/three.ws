// three.ws shared site navigation loader.
//
// Injects the global header (public/nav.html) into any page that includes a
// `<div id="nav-container"></div>` and `<script src="/nav.js">`, then wires the
// homepage nav behavior: hover/click dropdowns, the mobile drawer, the Walk
// Companion toggle, auth-aware CTAs, and active-page highlighting. The markup,
// styles (public/nav.css) and behavior here mirror pages/home.html so every
// page reads as the same site.

// Load the site-wide live activity ticker (public/feed.js) on every page that
// carries the shared nav. Self-mounting + idempotent; honours <html data-feed="off">.
function loadActivityFeed() {
	if (document.documentElement.getAttribute('data-feed') === 'off') return;
	if (document.querySelector('script[src="/feed.js"]')) return;
	const s = document.createElement('script');
	s.src = '/feed.js';
	s.defer = true;
	document.head.appendChild(s);
}

function boot() {
	loadActivityFeed();
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
		groups.forEach((g) => { if (g !== except) setOpen(g, false); });
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
					(items[(idx - 1 + items.length) % items.length] || items[0])?.focus({ preventScroll: true });
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
		if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
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
// When a signed-in hint exists, swap "Sign in" for the dashboard/My Agents
// entry points. Mirrors the hint written by the account layer.
function initAuthHint(root) {
	try {
		const raw = localStorage.getItem('3dagent:auth-hint');
		if (!raw) return;
		const { authed, name } = JSON.parse(raw);
		if (!authed) return;

		const signIn = root.querySelector('#home-nav-cta');
		if (signIn) signIn.hidden = true;
		const myAgents = root.querySelector('#home-nav-my-agents-li');
		if (myAgents) myAgents.hidden = false;
		const console = root.querySelector('#home-nav-user');
		if (console && name) console.textContent = name;

		// Mobile drawer equivalents.
		const drawerSignIn = root.querySelector('#home-nav-drawer-cta');
		if (drawerSignIn) drawerSignIn.hidden = true;
		const drawerMyAgents = root.querySelector('#home-nav-drawer-my-agents');
		if (drawerMyAgents) drawerMyAgents.hidden = false;
	} catch (_) {}
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
		try { localStorage.setItem(WALK_ENABLED_KEY, override); } catch (_) {}
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
			try { localStorage.setItem(WALK_ENABLED_KEY, '1'); } catch (_) {}
			ensureWalkCompanion();
		}
		sync();
	});

	window.addEventListener('walk-companion:change', sync);
}
