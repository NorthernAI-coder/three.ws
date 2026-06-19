/* three.ws corner-stack — one shared home for persistent bottom-right widgets.
 *
 * The platform grew a handful of independent floating cards — the "Getting
 * started" pill, the feature-discovery prompt, the "Your agent is ready"
 * onboarding banner — and each one hard-coded its own `position: fixed;
 * right; bottom` plus a magic z-index. With no awareness of one another they
 * piled onto the same pixel and covered page content (e.g. the Deploy page's
 * Live Preview). The +80px nudge on the onboarding card was an ad-hoc patch
 * for exactly that collision.
 *
 * This module replaces those one-off hacks with a single container that flows
 * its members vertically — newest/most-important nearest the corner — so they
 * never overlap each other or the underlying page. It is framework-free,
 * idempotent, dependency-free, and order-independent: a widget that mounts
 * before this script runs tags itself with `data-corner-priority` and appends
 * to <body>; this module adopts those orphans on init.
 *
 * Priority: HIGHER number = closer to the corner (bottom). Members are ordered
 * ascending top→bottom, so the highest-priority member is the bottom-most.
 *
 * API (window.twsCornerStack):
 *   mount(el, { priority })  — move `el` into the stack (sets priority if given)
 *   unmount(el)              — remove `el` from the stack
 *   ensure()                 — create/return the container element
 */
(function () {
	'use strict';
	if (window.twsCornerStack) return;

	var STACK_ID = 'tws-corner-stack';
	var STYLE_ID = 'tws-corner-stack-css';
	var ITEM_CLASS = 'tws-corner-item';
	var DEFAULT_PRIORITY = 50;
	var stack = null;

	var CSS = [
		/* Global stacking ladder — promotes the old comment-only convention to
		   real, referenceable tokens. Wide gaps leave room for future layers. */
		':root{',
		'--z-corner-feed:2147482000;',
		'--z-corner-stack:2147482500;',
		'--z-walk-companion:2147483000;',
		'--z-overlay-modal:2147483600;',
		'}',
		'#' + STACK_ID + '{',
		'position:fixed;right:18px;bottom:18px;',
		'z-index:var(--z-corner-stack,2147482500);',
		'display:flex;flex-direction:column;align-items:flex-end;',
		'gap:12px;max-width:min(380px,calc(100vw - 24px));',
		'max-height:calc(100dvh - 36px);overflow:visible;',
		/* Clicks fall through the gaps; members re-enable pointer events. */
		'pointer-events:none;',
		'}',
		'#' + STACK_ID + ':empty{display:none;}',
		/* relative (not static) keeps members in the flex flow while preserving a
		   containing block for their position:absolute children (e.g. the
		   getting-started panel, card close buttons). */
		'#' + STACK_ID + '>.' + ITEM_CLASS + '{',
		'position:relative;inset:auto;margin:0;pointer-events:auto;',
		'}',
		'@media (max-width:640px){',
		'#' + STACK_ID + '{right:12px;bottom:12px;left:12px;align-items:stretch;gap:10px;max-width:none;}',
		'}'
	].join('');

	function ensureCss() {
		if (document.getElementById(STYLE_ID)) return;
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = CSS;
		(document.head || document.documentElement).appendChild(style);
	}

	function ensureStack() {
		ensureCss();
		if (stack && document.body && document.body.contains(stack)) return stack;
		var existing = document.getElementById(STACK_ID);
		if (existing) { stack = existing; return stack; }
		stack = document.createElement('div');
		stack.id = STACK_ID;
		stack.setAttribute('role', 'region');
		stack.setAttribute('aria-label', 'Helper widgets');
		(document.body || document.documentElement).appendChild(stack);
		return stack;
	}

	function priorityOf(el) {
		var p = Number(el.getAttribute('data-corner-priority'));
		return Number.isFinite(p) ? p : DEFAULT_PRIORITY;
	}

	function place(el) {
		var s = ensureStack();
		el.classList.add(ITEM_CLASS);
		var p = priorityOf(el);
		var siblings = Array.prototype.slice.call(s.children);
		var before = null;
		for (var i = 0; i < siblings.length; i++) {
			if (siblings[i] === el) continue;
			if (priorityOf(siblings[i]) > p) { before = siblings[i]; break; }
		}
		s.insertBefore(el, before);
		return el;
	}

	function mount(el, opts) {
		if (!el) return el;
		if (opts && opts.priority != null) {
			el.setAttribute('data-corner-priority', String(opts.priority));
		}
		return place(el);
	}

	function unmount(el) {
		if (el && stack && el.parentNode === stack) stack.removeChild(el);
	}

	/* Adopt widgets that mounted to <body> before this script executed. */
	function adoptOrphans() {
		if (!document.body) return;
		var orphans = document.body.querySelectorAll(':scope > [data-corner-priority]');
		for (var i = 0; i < orphans.length; i++) place(orphans[i]);
	}

	window.twsCornerStack = { mount: mount, unmount: unmount, ensure: ensureStack };

	if (document.body) adoptOrphans();
	else document.addEventListener('DOMContentLoaded', adoptOrphans);
})();
