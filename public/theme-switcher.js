// three.ws site-wide theme switcher.
//
// Owns the dark ⇄ light theme at runtime. The brand default is dark; light is
// the single alternate palette (remapped at the token layer in tokens.css).
//
// Preference model — shared with the dashboard Appearance setting:
//   localStorage key  : 'twx_theme'
//   values            : 'dark' | 'light' | 'auto'   ('auto' follows the OS)
//   unset             : treated as 'dark' (the platform's brand default)
//
// An inline boot script (injected by scripts/inject-theme-boot.mjs) applies the
// resolved theme to <html data-theme> before first paint, so this module never
// causes a flash — it re-applies idempotently, wires the nav toggle, keeps the
// button in sync, follows the system in 'auto' mode, and mirrors changes across
// tabs. Everything is exposed on window.threeTheme for other surfaces (e.g. the
// dashboard settings panel) to drive the same single source of truth.

(function () {
	'use strict';
	if (window.threeTheme) return; // idempotent — only one switcher per document

	var STORAGE_KEY = 'twx_theme';
	var prefersLight =
		window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');

	function getMode() {
		try {
			var v = localStorage.getItem(STORAGE_KEY);
			if (v === 'light' || v === 'dark' || v === 'auto') return v;
		} catch (e) {
			/* storage blocked (private mode / sandboxed iframe) — fall through */
		}
		return 'dark';
	}

	// Resolve a stored mode to the concrete theme that should paint right now.
	function resolve(mode) {
		var m = mode || getMode();
		if (m === 'auto') return prefersLight && prefersLight.matches ? 'light' : 'dark';
		return m === 'light' ? 'light' : 'dark';
	}

	function applyEffective(effective) {
		document.documentElement.setAttribute('data-theme', effective);
		syncToggle(effective);
		window.dispatchEvent(
			new CustomEvent('themechange', { detail: { mode: getMode(), effective: effective } }),
		);
	}

	// Reflect the live theme onto the nav toggle button (label + pressed state).
	// Safe to call before the nav is injected — it just no-ops until the button
	// exists, and the MutationObserver below replays it once it appears.
	function syncToggle(effective) {
		var btn = document.getElementById('nav-theme-toggle');
		if (!btn) return;
		var isLight = effective === 'light';
		btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
		btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
	}

	// Persist + apply a mode. 'dark'/'light' are explicit; 'auto' follows the OS.
	function setMode(mode) {
		var next = mode === 'light' || mode === 'auto' ? mode : 'dark';
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch (e) {
			/* persistence unavailable — still apply for this session */
		}
		applyEffective(resolve(next));
		return next;
	}

	// The nav button is a simple binary flip between the two visible themes,
	// writing an explicit choice (never 'auto'); the tri-state lives in settings.
	function toggle() {
		var nextEffective = resolve() === 'light' ? 'dark' : 'light';
		setMode(nextEffective);
		return nextEffective;
	}

	window.threeTheme = {
		STORAGE_KEY: STORAGE_KEY,
		get: getMode,
		resolve: resolve,
		set: setMode,
		toggle: toggle,
	};

	// Apply immediately so direct module loads (or a missing boot script) still
	// land on the right theme without waiting for the nav.
	applyEffective(resolve());

	// Delegated click — independent of when the async-injected nav button mounts.
	document.addEventListener('click', function (e) {
		var t = e.target && e.target.closest && e.target.closest('#nav-theme-toggle');
		if (t) {
			e.preventDefault();
			toggle();
		}
	});

	// When the OS scheme changes, follow it only if the user is in 'auto'.
	if (prefersLight) {
		var onScheme = function () {
			if (getMode() === 'auto') applyEffective(resolve());
		};
		if (prefersLight.addEventListener) prefersLight.addEventListener('change', onScheme);
		else if (prefersLight.addListener) prefersLight.addListener(onScheme);
	}

	// Mirror changes made in other tabs/windows.
	window.addEventListener('storage', function (e) {
		if (e.key === STORAGE_KEY) applyEffective(resolve());
	});

	// The nav header is injected asynchronously by nav.js; once the toggle
	// button appears, replay the current state onto it, then stop observing.
	if (document.getElementById('nav-theme-toggle')) {
		syncToggle(resolve());
	} else if (window.MutationObserver) {
		var obs = new MutationObserver(function () {
			if (document.getElementById('nav-theme-toggle')) {
				syncToggle(resolve());
				obs.disconnect();
			}
		});
		obs.observe(document.documentElement, { childList: true, subtree: true });
	}
})();
