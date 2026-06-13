// three.ws global search — Cmd/Ctrl-K command palette.
// Self-mounting IIFE: nav.js loads this on every page.
// Data sources:
//   • /api/explore?q=     — live DB query for agents/avatars (debounced)
//   • /api/pump/search?q= — live coin/token search (falls back to trending)
//   • /features.json      — static page/feature registry (loaded once)
//   • /skills-index.json  — skill catalog (loaded once)
//   • quick actions + recents — in-memory verbs + localStorage history
// Opt out per page: <html data-search="off">

(function () {
	'use strict';

	if (window.__twsSearch) return;
	if (typeof document === 'undefined') return;
	if (document.documentElement.getAttribute('data-search') === 'off') return;

	window.__twsSearch = true;

	// ── CSS ──────────────────────────────────────────────────────────────────

	var CSS = [
		/* dialog reset */
		'#tws-search-dialog{all:unset;display:none;position:fixed;inset:0;z-index:9999;}',
		'#tws-search-dialog[open]{display:flex;align-items:flex-start;justify-content:center;padding:80px 16px 16px;}',
		/* backdrop */
		'#tws-search-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:tws-sk-fadein .12s ease;}',
		/* panel */
		'#tws-search-panel{position:relative;z-index:1;background:#111;border:1px solid #2a2a2a;border-radius:14px;width:100%;max-width:620px;overflow:hidden;',
		'box-shadow:0 24px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);',
		'animation:tws-sk-slidein .14s cubic-bezier(.25,.46,.45,.94);}',
		/* input row */
		'#tws-search-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #1c1c1c;}',
		'#tws-search-icon{flex-shrink:0;width:18px;height:18px;color:#6a6a6a;}',
		'#tws-search-input{flex:1;background:none;border:none;outline:none;font:500 15px/1 inherit;color:#f6f6f6;caret-color:#f6f6f6;letter-spacing:-.01em;}',
		'#tws-search-input::placeholder{color:#4a4a4a;}',
		'#tws-search-kbd{display:flex;gap:4px;flex-shrink:0;}',
		'.tws-sk-key{display:inline-flex;align-items:center;justify-content:center;',
		'height:20px;padding:0 5px;border-radius:4px;border:1px solid #2a2a2a;',
		'font:600 10px/1 "JetBrains Mono",ui-monospace,monospace;color:#4a4a4a;letter-spacing:.06em;}',
		/* results */
		'#tws-search-results{overflow-y:auto;max-height:420px;padding:6px 0 8px;}',
		'#tws-search-results:empty{padding:0;}',
		/* category header */
		'.tws-sk-cat{font:600 10px/1 "JetBrains Mono",ui-monospace,monospace;',
		'letter-spacing:.14em;text-transform:uppercase;color:#4a4a4a;',
		'padding:10px 16px 4px;user-select:none;}',
		'.tws-sk-cat:first-child{padding-top:6px;}',
		/* result row */
		'.tws-sk-row{display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;',
		'border-radius:0;transition:background .1s;outline:none;text-decoration:none;color:inherit;}',
		'.tws-sk-row:hover,.tws-sk-row[aria-selected="true"]{background:#1c1c1c;}',
		'.tws-sk-row:active{background:#242424;}',
		'.tws-sk-row:focus-visible{background:#1c1c1c;outline:2px solid rgba(255,255,255,0.22);outline-offset:-2px;}',
		/* row icon */
		'.tws-sk-ico{flex-shrink:0;width:32px;height:32px;border-radius:8px;',
		'background:#181818;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:15px;}',
		'.tws-sk-ico img{width:100%;height:100%;object-fit:cover;border-radius:7px;}',
		/* row text */
		'.tws-sk-body{flex:1;min-width:0;}',
		'.tws-sk-name{font-size:13.5px;font-weight:500;color:#f6f6f6;letter-spacing:-.01em;',
		'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
		'.tws-sk-name mark{background:rgba(255,255,255,0.15);color:#fff;border-radius:3px;padding:0 2px;font-style:normal;}',
		'.tws-sk-desc{font-size:11.5px;color:#6a6a6a;margin-top:1px;',
		'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
		/* badge */
		'.tws-sk-badge{flex-shrink:0;font:600 9px/1 "JetBrains Mono",ui-monospace,monospace;',
		'letter-spacing:.08em;text-transform:uppercase;padding:3px 6px;',
		'border-radius:5px;background:#1c1c1c;border:1px solid #2a2a2a;color:#6a6a6a;}',
		/* states */
		'#tws-search-status{padding:20px 16px;font-size:13px;color:#6a6a6a;text-align:center;',
		'display:flex;flex-direction:column;align-items:center;gap:8px;}',
		'#tws-search-status .tws-sk-err-retry{',
		'margin-top:4px;padding:6px 14px;border-radius:7px;font-size:12px;',
		'background:#1c1c1c;border:1px solid #2a2a2a;color:#a8a8a8;cursor:pointer;',
		'text-decoration:none;transition:background .12s,border-color .12s;}',
		'#tws-search-status .tws-sk-err-retry:hover{background:#242424;border-color:#3a3a3a;color:#f6f6f6;}',
		/* spinner */
		'.tws-sk-spinner{width:18px;height:18px;border:2px solid #2a2a2a;border-top-color:#6a6a6a;',
		'border-radius:50%;animation:tws-sk-spin .7s linear infinite;}',
		/* skeleton rows */
		'.tws-sk-skel{display:flex;align-items:center;gap:10px;padding:8px 16px;}',
		'.tws-sk-skel-ico{width:32px;height:32px;border-radius:8px;background:#1c1c1c;animation:tws-sk-pulse 1.4s ease infinite;}',
		'.tws-sk-skel-lines{flex:1;display:flex;flex-direction:column;gap:5px;}',
		'.tws-sk-skel-l{height:12px;border-radius:4px;background:#1c1c1c;animation:tws-sk-pulse 1.4s ease infinite;}',
		'.tws-sk-skel-l.w60{width:60%}.tws-sk-skel-l.w40{width:40%}.tws-sk-skel-l.w80{width:80%}',
		/* live region */
		'#tws-search-live{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}',
		/* keyframes */
		'@keyframes tws-sk-fadein{from{opacity:0}to{opacity:1}}',
		'@keyframes tws-sk-slidein{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}',
		'@keyframes tws-sk-spin{to{transform:rotate(360deg)}}',
		'@keyframes tws-sk-pulse{0%,100%{opacity:.5}50%{opacity:1}}',
	].join('');

	(function injectCSS() {
		if (document.getElementById('tws-search-css')) return;
		var s = document.createElement('style');
		s.id = 'tws-search-css';
		s.textContent = CSS;
		document.head.appendChild(s);
	})();

	// ── State ────────────────────────────────────────────────────────────────

	var dialog, backdrop, panel, input, results, status, liveRegion;
	var featuresCache = null;
	var skillsCache = null;
	var debounceTimer = null;
	var currentController = null; // AbortController for in-flight explore requests
	var selectedIndex = -1;
	var allRows = []; // flat list of result row elements for keyboard nav

	// ── Data fetching ─────────────────────────────────────────────────────────

	function fetchFeatures() {
		if (featuresCache) return Promise.resolve(featuresCache);
		return fetch('/features.json')
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
			.then(function (data) {
				// Flatten sections into a single array of {path, title, description, section}
				var pages = [];
				(data.sections || []).forEach(function (sec) {
					(sec.pages || []).forEach(function (p) {
						if (p.indexable === false) return;
						pages.push({
							path: p.path,
							title: p.title,
							description: p.description || '',
							section: sec.id,
							sectionTitle: sec.title || sec.id,
						});
					});
				});
				featuresCache = pages;
				return pages;
			});
	}

	function fetchSkills() {
		if (skillsCache) return Promise.resolve(skillsCache);
		return fetch('/skills-index.json')
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
			.then(function (data) {
				skillsCache = Array.isArray(data) ? data : [];
				return skillsCache;
			});
	}

	function fetchAgents(q, signal) {
		var url = '/api/explore?q=' + encodeURIComponent(q) + '&limit=6&source=all&quality=all';
		return fetch(url, { signal: signal })
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
			.then(function (data) { return data.items || []; });
	}

	// Live coin/token search. Primary source is /api/pump/search (name/symbol
	// search across Solana tokens). If that endpoint is unavailable, fall back to
	// filtering /api/pump/trending — still real pump.fun/Birdeye data, just scoped
	// to what's trending — so the Coins category degrades instead of disappearing.
	function fetchCoins(q, signal) {
		var ql = q.toLowerCase();
		return fetch('/api/pump/search?q=' + encodeURIComponent(q) + '&limit=6', { signal: signal })
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
			.then(function (data) { return (data && data.data) || []; })
			.catch(function (err) {
				if (err && err.name === 'AbortError') throw err; // propagate cancellation
				return fetch('/api/pump/trending?limit=50', { signal: signal })
					.then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
					.then(function (data) {
						var coins = (data && data.data) || [];
						return coins.filter(function (c) {
							return matches(c.symbol, ql) || matches(c.name, ql);
						}).slice(0, 6);
					})
					.catch(function (e) { if (e && e.name === 'AbortError') throw e; return []; });
			});
	}

	// ── Quick actions ──────────────────────────────────────────────────────────
	// First-class verbs the palette can run from anywhere. Matched by title +
	// keyword bag so "make an avatar" finds "Create an avatar".
	var QUICK_ACTIONS = [
		{ title: 'Create an avatar', desc: 'Start a new 3D avatar', href: '/create', icon: '🧑‍🎨', keys: 'create new make avatar character build start' },
		{ title: 'Scan yourself to 3D', desc: 'Turn a selfie into a 3D model', href: '/scan', icon: '📸', keys: 'scan selfie photo capture me face camera' },
		{ title: 'Forge from text', desc: 'Generate a 3D model from a prompt', href: '/forge', icon: '✨', keys: 'forge generate text prompt ai model create' },
		{ title: 'Deploy an agent on-chain', desc: 'Register an agent on-chain', href: '/deploy', icon: '🚀', keys: 'deploy register onchain erc8004 publish ship launch agent' },
		{ title: 'Launch a coin', desc: 'Launch a token on pump.fun', href: '/launchpad', icon: '🪙', keys: 'launch coin token mint pump fun money $three' },
		{ title: 'Embed an agent', desc: 'Get an embed snippet for your site', href: '/embed.html', icon: '🔗', keys: 'embed iframe widget snippet share script integrate' },
		{ title: 'Browse all pages', desc: 'The full three.ws directory, filterable', href: '/sitemap', icon: '🗺️', keys: 'sitemap site map all pages everything directory index list browse find' },
	];

	// Default destinations shown when the palette opens with no query (and no
	// recent history yet) — the flagship surfaces, so the palette is never empty.
	var SUGGESTED_PAGES = [
		{ title: 'Explore agents', desc: 'Browse the agent & avatar directory', href: '/explore', icon: '🧭' },
		{ title: 'Marketplace', desc: 'Skills, agents and templates', href: '/marketplace', icon: '🛒' },
		{ title: 'Dashboard', desc: 'Your agents, tokens and activity', href: '/dashboard', icon: '📊' },
		{ title: 'Playground', desc: 'Walk the $three worlds', href: '/play', icon: '🎮' },
		{ title: 'Docs', desc: 'Guides, SDK and API reference', href: '/docs', icon: '📖' },
		{ title: 'All pages', desc: 'Every page on three.ws, in one directory', href: '/sitemap', icon: '🗺️' },
	];

	// ── Recents ─────────────────────────────────────────────────────────────────
	// Last few things the user opened from the palette, newest first.
	var RECENT_KEY = 'tws:search:recent';
	var RECENT_MAX = 6;

	function loadRecent() {
		try {
			var raw = localStorage.getItem(RECENT_KEY);
			var arr = raw ? JSON.parse(raw) : [];
			return Array.isArray(arr) ? arr.filter(function (r) { return r && r.href && r.name; }) : [];
		} catch (_) { return []; }
	}

	function recordRecent(payload) {
		if (!payload || !payload.href || !payload.name) return;
		try {
			var list = loadRecent().filter(function (r) { return r.href !== payload.href; });
			list.unshift({
				href: payload.href,
				name: payload.name,
				desc: payload.desc || '',
				badge: payload.badge || '',
				iconHTML: payload.iconHTML || '🕘',
			});
			localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
		} catch (_) {}
	}

	// ── String helpers ────────────────────────────────────────────────────────

	function escapeRegex(s) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function highlight(text, q) {
		if (!q) return esc(text);
		var re = new RegExp('(' + escapeRegex(q) + ')', 'gi');
		return esc(text).replace(re, '<mark>$1</mark>');
	}

	function esc(s) {
		return String(s || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function matches(text, q) {
		return (text || '').toLowerCase().indexOf(q.toLowerCase()) !== -1;
	}

	function score(item, q) {
		var name = (item.title || item.name || '').toLowerCase();
		var ql = q.toLowerCase();
		if (name === ql) return 3;
		if (name.startsWith(ql)) return 2;
		if (name.indexOf(ql) !== -1) return 1;
		return 0;
	}

	// ── DOM helpers ───────────────────────────────────────────────────────────

	function el(tag, attrs) {
		var e = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(function (k) {
				if (k === 'html') { e.innerHTML = attrs[k]; }
				else if (k === 'text') { e.textContent = attrs[k]; }
				else { e.setAttribute(k, attrs[k]); }
			});
		}
		return e;
	}

	function categoryHeader(label) {
		var h = el('div', { class: 'tws-sk-cat', 'aria-hidden': 'true' });
		h.textContent = label;
		return h;
	}

	function resultRow(href, iconHTML, name, desc, badge, q) {
		var a = el('a', {
			class: 'tws-sk-row',
			href: href,
			role: 'option',
			'aria-selected': 'false',
			tabindex: '-1',
		});

		var ico = el('div', { class: 'tws-sk-ico', 'aria-hidden': 'true' });
		ico.innerHTML = iconHTML;
		a.appendChild(ico);

		var body = el('div', { class: 'tws-sk-body' });
		var nameEl = el('div', { class: 'tws-sk-name', html: highlight(name, q) });
		body.appendChild(nameEl);
		if (desc) {
			var descEl = el('div', { class: 'tws-sk-desc', text: desc });
			body.appendChild(descEl);
		}
		a.appendChild(body);

		if (badge) {
			var b = el('span', { class: 'tws-sk-badge', text: badge });
			a.appendChild(b);
		}

		// Payload replayed into the Recents list when this row is opened.
		a._twsRecent = { href: href, name: name, desc: desc || '', badge: badge || '', iconHTML: iconHTML };

		a.addEventListener('click', function () { recordRecent(a._twsRecent); close(); });
		return a;
	}

	function agentIcon(item) {
		if (item.image) {
			return '<img src="' + esc(item.image) + '" alt="" loading="lazy" />';
		}
		return '🤖';
	}

	function coinIcon(coin) {
		if (coin.logo) {
			return '<img src="' + esc(coin.logo) + '" alt="" loading="lazy" />';
		}
		return '🪙';
	}

	function pageIcon(section) {
		var map = {
			main: '🏠', build: '🔨', labs: '🧪', crypto: '🔗',
			'agent-tools': '🛠', account: '👤', learn: '📖',
			blog: '📝', legal: '⚖️', machine: '⚙️', news: '📰',
		};
		return map[section] || '📄';
	}

	function skillIcon() { return '⚡'; }

	function skeletonRows(n) {
		var f = document.createDocumentFragment();
		for (var i = 0; i < n; i++) {
			var row = el('div', { class: 'tws-sk-skel' });
			var ico = el('div', { class: 'tws-sk-skel-ico' });
			var lines = el('div', { class: 'tws-sk-skel-lines' });
			var l1 = el('div', { class: 'tws-sk-skel-l w60' });
			var l2 = el('div', { class: 'tws-sk-skel-l w40' });
			lines.appendChild(l1);
			lines.appendChild(l2);
			row.appendChild(ico);
			row.appendChild(lines);
			f.appendChild(row);
		}
		return f;
	}

	// ── Build UI ──────────────────────────────────────────────────────────────

	function buildUI() {
		if (document.getElementById('tws-search-dialog')) return;

		// Backdrop (sits behind the panel but inside dialog)
		backdrop = el('div', { id: 'tws-search-backdrop' });
		backdrop.addEventListener('click', close);

		// Input row
		var inputRow = el('div', { id: 'tws-search-row' });

		var searchIconSvg = [
			'<svg id="tws-search-icon" viewBox="0 0 18 18" fill="none"',
			' stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">',
			'<circle cx="7.5" cy="7.5" r="5"/><line x1="11.5" y1="11.5" x2="16" y2="16"/></svg>',
		].join('');
		inputRow.insertAdjacentHTML('beforeend', searchIconSvg);

		input = el('input', {
			id: 'tws-search-input',
			type: 'search',
			placeholder: 'Search agents, coins, skills, actions, pages…',
			autocomplete: 'off',
			autocorrect: 'off',
			spellcheck: 'false',
			'aria-label': 'Search',
			'aria-controls': 'tws-search-results',
			'aria-autocomplete': 'list',
			role: 'combobox',
			'aria-expanded': 'false',
			'aria-activedescendant': '',
		});
		inputRow.appendChild(input);

		var kbdWrap = el('div', { id: 'tws-search-kbd', 'aria-hidden': 'true' });
		var k1 = el('kbd', { class: 'tws-sk-key' });
		k1.textContent = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
		var k2 = el('kbd', { class: 'tws-sk-key' });
		k2.textContent = 'K';
		kbdWrap.appendChild(k1);
		kbdWrap.appendChild(k2);
		inputRow.appendChild(kbdWrap);

		// Results listbox
		results = el('div', {
			id: 'tws-search-results',
			role: 'listbox',
			'aria-label': 'Search results',
		});

		// Status area
		status = el('div', { id: 'tws-search-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
		status.hidden = true;

		// Live region for screen readers
		liveRegion = el('div', { id: 'tws-search-live', 'aria-live': 'assertive', 'aria-atomic': 'true' });

		// Panel
		panel = el('div', { id: 'tws-search-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' });
		panel.appendChild(inputRow);
		panel.appendChild(results);
		panel.appendChild(status);
		panel.appendChild(liveRegion);

		// Outer dialog (focus trap container)
		dialog = el('div', { id: 'tws-search-dialog' });
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.appendChild(backdrop);
		dialog.appendChild(panel);
		document.body.appendChild(dialog);

		// Wire events
		input.addEventListener('input', onInput);
		input.addEventListener('keydown', onKeydown);
		dialog.addEventListener('keydown', onDialogKeydown);
	}

	// ── Open / Close ──────────────────────────────────────────────────────────

	function open() {
		buildUI();
		dialog.setAttribute('open', '');
		document.body.style.overflow = 'hidden';
		input.value = '';
		selectedIndex = -1;
		allRows = [];
		showInitial();
		requestAnimationFrame(function () { input.focus(); });
		// Prefetch static data in the background
		fetchFeatures().catch(function () {});
		fetchSkills().catch(function () {});
	}

	function close() {
		if (!dialog) return;
		dialog.removeAttribute('open');
		document.body.style.overflow = '';
		if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
		if (currentController) { currentController.abort(); currentController = null; }
		selectedIndex = -1;
		allRows = [];
	}

	function isOpen() {
		return dialog && dialog.hasAttribute('open');
	}

	// ── Keyboard handlers ──────────────────────────────────────────────────────

	function onDialogKeydown(e) {
		if (e.key === 'Escape') { e.preventDefault(); close(); }
	}

	function onKeydown(e) {
		switch (e.key) {
		case 'ArrowDown':
			e.preventDefault();
			moveSelection(1);
			break;
		case 'ArrowUp':
			e.preventDefault();
			moveSelection(-1);
			break;
		case 'Enter':
			e.preventDefault();
			activateSelected();
			break;
		case 'Tab':
			e.preventDefault();
			moveSelection(e.shiftKey ? -1 : 1);
			break;
		}
	}

	function moveSelection(dir) {
		if (!allRows.length) return;
		selectedIndex = Math.max(-1, Math.min(allRows.length - 1, selectedIndex + dir));
		allRows.forEach(function (r, i) {
			var sel = i === selectedIndex;
			r.setAttribute('aria-selected', sel ? 'true' : 'false');
			if (sel) {
				r.scrollIntoView({ block: 'nearest' });
				input.setAttribute('aria-activedescendant', r.id || ('tws-sk-row-' + i));
			}
		});
		if (selectedIndex === -1) input.setAttribute('aria-activedescendant', '');
	}

	function activateSelected() {
		if (selectedIndex >= 0 && allRows[selectedIndex]) {
			var row = allRows[selectedIndex];
			recordRecent(row._twsRecent);
			close();
			window.location.href = row.href;
		}
	}

	// ── States ─────────────────────────────────────────────────────────────────

	function showInitial() {
		var groups = [];

		var recent = loadRecent();
		if (recent.length) {
			groups.push({
				label: 'Recent',
				items: recent.map(function (r) {
					return { el: resultRow(r.href, r.iconHTML, r.name, r.desc, r.badge, '') };
				}),
			});
		}

		groups.push({
			label: 'Quick actions',
			items: QUICK_ACTIONS.map(function (a) {
				return { el: resultRow(a.href, a.icon, a.title, a.desc, 'Action', '') };
			}),
		});

		groups.push({
			label: recent.length ? 'Jump to' : 'Suggested',
			items: SUGGESTED_PAGES.map(function (p) {
				return { el: resultRow(p.href, p.icon, p.title, p.desc, '', '') };
			}),
		});

		renderResults(groups, '', { silent: true });
	}

	function showLoading() {
		results.innerHTML = '';
		allRows = [];
		selectedIndex = -1;
		status.hidden = true;
		results.appendChild(skeletonRows(4));
		input.setAttribute('aria-expanded', 'true');
	}

	function showNoResults(q) {
		results.innerHTML = '';
		allRows = [];
		selectedIndex = -1;
		status.hidden = false;
		input.setAttribute('aria-expanded', 'false');
		status.innerHTML = [
			'<span style="color:#a8a8a8;font-size:13px">No matches for <strong style="color:#f6f6f6">"' + esc(q) + '"</strong></span>',
			'<span style="color:#4a4a4a;font-size:12px">Try a different name, feature, or skill</span>',
		].join('');
		var browseAll = el('a', {
			class: 'tws-sk-err-retry',
			href: '/sitemap?q=' + encodeURIComponent(q),
			text: 'Browse all pages →',
		});
		status.appendChild(browseAll);
		liveRegion.textContent = 'No results for ' + q + '. A link to browse all pages is available.';
	}

	function showError(retry) {
		results.innerHTML = '';
		allRows = [];
		selectedIndex = -1;
		status.hidden = false;
		input.setAttribute('aria-expanded', 'false');
		status.innerHTML = '<span style="color:#a8a8a8;font-size:13px">Search unavailable</span>';
		var btn = el('button', { class: 'tws-sk-err-retry', text: 'Retry' });
		btn.addEventListener('click', retry);
		status.appendChild(btn);
		liveRegion.textContent = 'Search error. Press retry to try again.';
	}

	// ── Render results ────────────────────────────────────────────────────────

	function renderResults(groups, q, opts) {
		var silent = opts && opts.silent;
		results.innerHTML = '';
		allRows = [];
		selectedIndex = -1;

		var totalItems = 0;
		groups.forEach(function (g) { totalItems += g.items.length; });

		if (totalItems === 0) {
			showNoResults(q);
			return;
		}

		status.hidden = true;
		input.setAttribute('aria-expanded', 'true');

		groups.forEach(function (g) {
			if (!g.items.length) return;
			results.appendChild(categoryHeader(g.label));
			g.items.forEach(function (item, idx) {
				var row = item.el;
				row.id = 'tws-sk-row-' + allRows.length;
				row.setAttribute('aria-setsize', String(totalItems));
				row.setAttribute('aria-posinset', String(allRows.length + 1));
				results.appendChild(row);
				allRows.push(row);
			});
		});

		if (!silent) {
			liveRegion.textContent = totalItems + ' result' + (totalItems === 1 ? '' : 's') + ' for ' + q;
		}
	}

	// ── Search ─────────────────────────────────────────────────────────────────

	function onInput() {
		var q = input.value.trim();
		if (!q) { showInitial(); return; }

		showLoading();

		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(function () { runSearch(q); }, 200);
	}

	function runSearch(q) {
		// Cancel any in-flight agent request
		if (currentController) currentController.abort();
		currentController = new AbortController();
		var signal = currentController.signal;

		var agentsPromise = fetchAgents(q, signal).catch(function (err) {
			if (err && err.name === 'AbortError') return null; // stale, ignore
			return [];
		});

		var coinsPromise = fetchCoins(q, signal).catch(function (err) {
			if (err && err.name === 'AbortError') return null; // stale, ignore
			return [];
		});

		Promise.all([fetchFeatures(), fetchSkills(), agentsPromise, coinsPromise])
			.then(function (res) {
				if (res[2] === null || res[3] === null) return; // aborted — don't render stale results

				var pages = res[0];
				var skills = res[1];
				var agents = res[2];
				var coins = res[3];

				// Filter features/docs locally
				var docSections = { learn: true, blog: true, legal: true, news: true };
				var matchedPages = pages
					.filter(function (p) { return !docSections[p.section] && (matches(p.title, q) || matches(p.description, q)); })
					.sort(function (a, b) { return score(b, q) - score(a, q); })
					.slice(0, 5);

				var matchedDocs = pages
					.filter(function (p) { return docSections[p.section] && (matches(p.title, q) || matches(p.description, q)); })
					.sort(function (a, b) { return score(b, q) - score(a, q); })
					.slice(0, 4);

				var matchedSkills = skills
					.filter(function (s) { return matches(s.name, q) || matches(s.description, q); })
					.sort(function (a, b) { return score(b, q) - score(a, q); })
					.slice(0, 4);

				var matchedActions = QUICK_ACTIONS.filter(function (act) {
					return matches(act.title, q) || matches(act.keys, q) || matches(act.desc, q);
				}).slice(0, 4);

				var actionItems = matchedActions.map(function (act) {
					return { el: resultRow(act.href, act.icon, act.title, act.desc, 'Action', q) };
				});

				var coinItems = (coins || []).slice(0, 6).map(function (c) {
					var href = c.mint ? '/communities/' + esc(c.mint) : '#';
					return {
						el: resultRow(
							href,
							coinIcon(c),
							c.name || c.symbol || 'Coin',
							c.symbol ? '$' + c.symbol : '',
							'Coin',
							q
						),
					};
				});

				var agentItems = (agents || []).slice(0, 6).map(function (a) {
					var href = '/agent/' + esc(a.agent_id || a.id || '');
					return {
						el: resultRow(
							href,
							agentIcon(a),
							a.name || 'Agent',
							a.description || '',
							a.source === 'solana' ? 'Solana' : a.chain_id ? 'ERC-8004' : '',
							q
						),
					};
				});

				var pageItems = matchedPages.map(function (p) {
					return {
						el: resultRow(p.path, pageIcon(p.section), p.title, p.description, p.sectionTitle, q),
					};
				});

				var docItems = matchedDocs.map(function (p) {
					return {
						el: resultRow(p.path, '📖', p.title, p.description, p.sectionTitle, q),
					};
				});

				var skillItems = matchedSkills.map(function (s) {
					var href = '/marketplace?tab=skills&id=' + esc(s.id || '');
					return {
						el: resultRow(href, skillIcon(), s.name, s.description, s.version || '', q),
					};
				});

				renderResults([
					{ label: 'Actions', items: actionItems },
					{ label: 'Agents', items: agentItems },
					{ label: 'Coins', items: coinItems },
					{ label: 'Skills', items: skillItems },
					{ label: 'Features & Pages', items: pageItems },
					{ label: 'Docs', items: docItems },
				], q);
			})
			.catch(function () {
				showError(function () { runSearch(q); });
			});
	}

	// ── Global shortcut + nav button ───────────────────────────────────────────

	document.addEventListener('keydown', function (e) {
		// Cmd-K (Mac) or Ctrl-K (Win/Linux) — open/close palette
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			// Don't intercept when typing in an input unless it's our own
			var tag = document.activeElement && document.activeElement.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
				if (document.activeElement !== input) return;
			}
			e.preventDefault();
			if (isOpen()) { close(); } else { open(); }
		}
	});

	// Wire any nav search button that nav.html injects
	document.addEventListener('click', function (e) {
		// e.target may be a non-Element (text node, document); closest() lives on
		// Elements only, so resolve the nearest Element before calling it.
		var t = e.target;
		var el = t && t.nodeType === 1 ? t : (t && t.parentElement) || null;
		var btn = el && el.closest('[data-search-open]');
		if (btn) { e.preventDefault(); open(); }
	});

	// ── Expose public API ──────────────────────────────────────────────────────

	window.__twsSearch = { open: open, close: close };
})();
