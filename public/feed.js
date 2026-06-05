// three.ws live activity ticker — the site-wide "something is always happening
// here" widget. Self-mounting: nav.js loads this on every page. Renders a small
// pulsing pill bottom-left that expands into a live panel of recent platform
// events (coin buys, agent deploys, level-ups, world joins). Polls GET /api/feed
// and prepends anything new.
//
// Opt out per page with <html data-feed="off"> or window.__twsFeedOff = true.
// The data source and event shape live in api/_lib/feed.js.

(function () {
	'use strict';

	if (window.__twsFeed) return; // idempotent — never double-mount
	if (typeof document === 'undefined') return;
	if (document.documentElement.getAttribute('data-feed') === 'off') return;
	if (window.__twsFeedOff) return;

	var API = '/api/feed?limit=30';
	// Polled from every page the widget mounts on. Kept at/above the endpoint's
	// edge-cache window so the CDN absorbs most polls instead of each one hitting
	// Redis — the feed is a delight layer, so 20s feels live and saves quota.
	var POLL_MS = 20000;
	var STORE_KEY = 'tws-feed:open'; // remember collapsed vs expanded across pages

	// ── State ────────────────────────────────────────────────────────────────
	var events = []; // newest-first, capped
	var seenIds = Object.create(null);
	var unseen = 0; // new since last time the panel was open
	var open = false;
	var loaded = false;
	var errored = false;
	var pollTimer = null;
	var root, pill, pillText, pillCount, panel, list;

	try {
		open = localStorage.getItem(STORE_KEY) === '1';
	} catch (_) {}

	// ── Rendering helpers ─────────────────────────────────────────────────────
	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		return n;
	}

	function shortMint(m) {
		m = String(m || '');
		return m.length > 8 ? m.slice(0, 4) + '…' + m.slice(-4) : m;
	}

	function fmtSol(n) {
		var v = Number(n);
		if (!isFinite(v) || v <= 0) return '';
		if (v >= 100) return Math.round(v).toString();
		// up to 3 significant decimals, trimmed
		return parseFloat(v.toFixed(3)).toString();
	}

	function relTime(ts) {
		var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
		if (s < 10) return 'just now';
		if (s < 60) return s + 's ago';
		var m = Math.floor(s / 60);
		if (m < 60) return m + 'm ago';
		var h = Math.floor(m / 60);
		if (h < 24) return h + 'h ago';
		var d = Math.floor(h / 24);
		return d + 'd ago';
	}

	// Per-type presentation. Returns { icon, href, build(textNode) } where build
	// fills a container with text — user-supplied strings go in via textContent
	// (createTextNode / el(text)), never innerHTML, so the world-readable feed
	// can't inject markup.
	var KINDS = {
		'coin-buy': {
			icon: '↗',
			href: function (e) { return e.mint ? '/play?coin=' + encodeURIComponent(e.mint) : '/play'; },
			parts: function (e) {
				var sol = fmtSol(e.sol);
				return [
					bold(e.actor || 'Someone'),
					' aped ',
					sol ? bold(sol + ' SOL') : 'in',
					' into ',
					bold(shortMint(e.mint)),
				];
			},
		},
		'agent-deploy': {
			icon: '✦',
			href: function (e) { return e.agentId ? '/agent/' + encodeURIComponent(e.agentId) : '/discover'; },
			parts: function (e) { return [bold(e.name || e.actor || 'A new agent'), ' just joined three.ws']; },
		},
		'agent-onchain': {
			icon: '⛓',
			href: function (e) { return e.agentId ? '/agent/' + encodeURIComponent(e.agentId) : '/discover'; },
			parts: function (e) {
				var who = bold(e.name || e.actor || 'An agent');
				return e.chain ? [who, ' deployed on-chain on ', bold(e.chain)] : [who, ' just deployed on-chain'];
			},
		},
		'level-up': {
			icon: '⬆',
			href: function () { return '/play'; },
			parts: function (e) {
				return [bold(e.actor || 'A player'), ' reached ', bold(cap(e.skill) + ' ' + e.level)];
			},
		},
		'world-join': {
			icon: '◉',
			href: function (e) { return e.coin ? '/play?coin=' + encodeURIComponent(e.coin) : '/play'; },
			parts: function (e) {
				return [bold(e.actor || 'Someone'), ' is hanging out in ', bold(e.coinName || 'a world')];
			},
		},
		jackpot: {
			icon: '★',
			href: function () { return '/play'; },
			parts: function (e) { return [bold(e.actor || 'A player'), ' won ', bold(e.reward || 'the jackpot')]; },
		},
		payment: {
			icon: '✓',
			href: function (e) { return e.explorerUrl || null; },
			parts: function (e) {
				var amtParts = [];
				if (e.usdcAtomic != null) {
					var dec = Number(e.usdcAtomic) / 1e6;
					var fmt = dec < 0.01 ? dec.toFixed(4) : dec < 1 ? dec.toFixed(3) : dec.toFixed(2);
					amtParts.push(' $' + fmt);
				}
				var toParts = e.recipientLabel ? [' to ', bold(String(e.recipientLabel).slice(0, 40))] : [];
				var actorParts = [bold(e.actor || 'User'), ' paid'];
				return actorParts.concat(amtParts).concat(toParts);
			},
		},
	};

	function bold(t) {
		var b = document.createElement('b');
		b.textContent = t == null ? '' : String(t);
		return b;
	}
	function cap(s) {
		s = String(s || '');
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
	}

	// Flatten a parts array (strings + <b> nodes) into a target element.
	function fillText(target, parts) {
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i];
			target.appendChild(typeof p === 'string' ? document.createTextNode(p) : p);
		}
	}

	function buildRow(e) {
		var kind = KINDS[e.type];
		if (!kind) return null;
		var href = kind.href(e);
		var row = el(href ? 'a' : 'div', 'tws-feed-item');
		if (href) {
			row.href = href;
			row.setAttribute('role', 'listitem');
		}
		var ico = el('span', 'tws-feed-ico');
		ico.setAttribute('data-kind', e.type);
		ico.setAttribute('aria-hidden', 'true');
		ico.textContent = kind.icon;
		var body = el('div', 'tws-feed-body');
		var text = el('div', 'tws-feed-text');
		fillText(text, kind.parts(e));
		var time = el('div', 'tws-feed-time', relTime(e.ts));
		time.setAttribute('data-ts', e.ts);
		body.appendChild(text);
		body.appendChild(time);
		row.appendChild(ico);
		row.appendChild(body);
		return row;
	}

	// One-line summary for the collapsed pill (latest event).
	function pillSummary(e) {
		var kind = KINDS[e.type];
		if (!kind) return null;
		var frag = document.createDocumentFragment();
		fillText(frag, kind.parts(e));
		return frag;
	}

	// ── DOM build ──────────────────────────────────────────────────────────────
	function mount() {
		ensureCss();
		root = el('div', 'tws-feed');
		root.setAttribute('aria-live', 'off');

		pill = el('button', 'tws-feed-pill');
		pill.type = 'button';
		pill.appendChild(el('span', 'tws-feed-dot'));
		pillText = el('span', 'tws-feed-pill-text');
		pillText.appendChild(document.createTextNode('Live activity'));
		pill.appendChild(pillText);
		pillCount = el('span', 'tws-feed-count');
		pillCount.hidden = true;
		pill.appendChild(pillCount);
		pill.addEventListener('click', expand);

		panel = el('div', 'tws-feed-panel');
		panel.hidden = true;
		var head = el('div', 'tws-feed-head');
		head.appendChild(el('span', 'tws-feed-dot'));
		head.appendChild(el('span', 'tws-feed-title', 'Live activity'));
		var close = el('button', 'tws-feed-close', '×');
		close.type = 'button';
		close.setAttribute('aria-label', 'Collapse activity feed');
		close.addEventListener('click', collapse);
		head.appendChild(close);
		list = el('ul', 'tws-feed-list');
		list.setAttribute('role', 'log');
		list.setAttribute('aria-label', 'Recent activity');
		list.setAttribute('aria-live', 'polite');
		panel.appendChild(head);
		panel.appendChild(list);

		root.appendChild(pill);
		root.appendChild(panel);
		document.body.appendChild(root);

		applyOpenState();
		renderSkeleton();

		// Keyboard: Escape collapses an open panel.
		document.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && open) collapse();
		});
		// Pause polling on hidden tabs; refresh immediately on return.
		document.addEventListener('visibilitychange', function () {
			if (document.hidden) {
				stopPolling();
			} else {
				poll();
				startPolling();
			}
		});
		// Hide entirely while a page element is fullscreen (immersive 3D etc.).
		document.addEventListener('fullscreenchange', function () {
			root.hidden = !!document.fullscreenElement;
		});
	}

	function ensureCss() {
		if (document.querySelector('link[href="/feed.css"]')) return;
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = '/feed.css';
		document.head.appendChild(link);
	}

	// ── State transitions ──────────────────────────────────────────────────────
	function applyOpenState() {
		panel.hidden = !open;
		pill.hidden = open;
		pill.setAttribute('aria-expanded', open ? 'true' : 'false');
		if (open) {
			unseen = 0;
			updateCount();
		}
	}
	function expand() {
		open = true;
		try { localStorage.setItem(STORE_KEY, '1'); } catch (_) {}
		applyOpenState();
		render();
	}
	function collapse() {
		open = false;
		try { localStorage.setItem(STORE_KEY, '0'); } catch (_) {}
		applyOpenState();
		updatePill();
	}

	function updateCount() {
		if (unseen > 0) {
			pillCount.hidden = false;
			pillCount.textContent = unseen > 9 ? '9+' : String(unseen);
			pill.setAttribute('aria-label', 'Live activity — ' + unseen + ' new. Open feed.');
		} else {
			pillCount.hidden = true;
			pill.setAttribute('aria-label', 'Live activity. Open feed.');
		}
	}

	function updatePill() {
		var latest = events[0];
		// Empty the text node container, then refill.
		while (pillText.firstChild) pillText.removeChild(pillText.firstChild);
		if (latest) {
			var frag = pillSummary(latest);
			if (frag) pillText.appendChild(frag);
			else pillText.appendChild(document.createTextNode('Live activity'));
		} else if (errored && !loaded) {
			pillText.appendChild(document.createTextNode('Activity'));
		} else {
			pillText.appendChild(document.createTextNode(loaded ? "It's quiet right now" : 'Live activity'));
		}
		updateCount();
	}

	// ── Render the panel list ──────────────────────────────────────────────────
	function renderSkeleton() {
		list.textContent = '';
		for (var i = 0; i < 4; i++) {
			var li = el('li', 'tws-feed-skel');
			li.appendChild(el('span', 's-ico'));
			var col = el('div');
			col.style.flex = '1';
			col.appendChild(el('span', 's-a'));
			col.appendChild(el('span', 's-b'));
			li.appendChild(col);
			list.appendChild(li);
		}
	}

	function renderMessage(strongTxt, rest) {
		list.textContent = '';
		var li = el('li');
		var msg = el('div', 'tws-feed-msg');
		msg.appendChild(el('strong', null, strongTxt));
		if (rest) msg.appendChild(rest);
		li.appendChild(msg);
		list.appendChild(li);
	}

	function render() {
		if (!open) { updatePill(); return; }
		if (!loaded && !errored) { renderSkeleton(); return; }
		if (!events.length) {
			if (errored) {
				var retry = document.createElement('a');
				retry.href = '#';
				retry.textContent = 'Try again';
				retry.addEventListener('click', function (e) { e.preventDefault(); poll(); });
				renderMessage('Activity paused', wrapMsg('Couldn’t reach the feed. ', retry));
			} else {
				var go = document.createElement('a');
				go.href = '/play';
				go.textContent = 'Drop into a world';
				renderMessage("It's quiet right now", wrapMsg('Be the first — ', go));
			}
			return;
		}
		list.textContent = '';
		for (var i = 0; i < events.length; i++) {
			var row = buildRow(events[i]);
			if (row) list.appendChild(row);
		}
	}

	function wrapMsg(text, node) {
		var span = el('span', null, text);
		if (node) span.appendChild(node);
		return span;
	}

	// Refresh the "2m ago" labels in place without rebuilding rows.
	function refreshTimes() {
		var nodes = list.querySelectorAll('.tws-feed-time');
		for (var i = 0; i < nodes.length; i++) {
			var ts = Number(nodes[i].getAttribute('data-ts'));
			if (ts) nodes[i].textContent = relTime(ts);
		}
	}

	// ── Data ───────────────────────────────────────────────────────────────────
	function merge(incoming) {
		var added = 0;
		var fresh = [];
		for (var i = 0; i < incoming.length; i++) {
			var e = incoming[i];
			if (!e || !e.id || seenIds[e.id]) continue;
			seenIds[e.id] = 1;
			fresh.push(e);
			added++;
		}
		if (added) {
			// Incoming is newest-first; prepend and keep the list bounded.
			events = fresh.concat(events).slice(0, 40);
			if (!open && loaded) unseen = Math.min(99, unseen + added);
		}
		return added;
	}

	function poll() {
		fetch(API, { headers: { accept: 'application/json' }, credentials: 'omit' })
			.then(function (r) {
				if (!r.ok) throw new Error('http ' + r.status);
				return r.json();
			})
			.then(function (data) {
				errored = false;
				var first = !loaded;
				loaded = true;
				var added = merge(Array.isArray(data.events) ? data.events : []);
				if (open) {
					if (first || added) render();
					else refreshTimes();
				} else {
					updatePill();
				}
			})
			.catch(function () {
				errored = true;
				if (!loaded) {
					if (open) render();
					else updatePill();
				}
			});
	}

	function startPolling() {
		stopPolling();
		pollTimer = setInterval(function () {
			poll();
			refreshTimes();
		}, POLL_MS);
	}
	function stopPolling() {
		if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	}

	// ── Public surface ─────────────────────────────────────────────────────────
	window.__twsFeed = {
		open: expand,
		close: collapse,
		refresh: poll,
		events: function () { return events.slice(); },
	};

	function boot() {
		mount();
		poll();
		startPolling();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
