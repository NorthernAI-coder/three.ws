// @ts-check
// First-party client-side error reporting. Captures uncaught exceptions,
// unhandled promise rejections, and failed resource loads on every page, then
// batches them to POST /api/client-errors where they land in the Vercel
// function logs (searchable as "[client-error]") and Sentry when configured.
//
// A tiny inline bootstrap (injected by the `client-error-reporter` plugin in
// vite.config.js) installs the window listeners synchronously at the top of
// <head> and queues raw events into window.__threeErrQ; this file loads
// deferred, drains that queue, and takes over the queue's push so nothing
// fired during page load is lost.
//
// Fails silent by design: a reporting pipeline must never become a source of
// errors itself, so every send is fire-and-forget and every handler is
// exception-proof.
(() => {
	'use strict';
	// Untyped view of window for our private globals (__threeErrQ, __threeErrCap)
	// shared with the inline bootstrap injected by vite.config.js.
	const win = /** @type {any} */ (window);
	if (win.__threeErrorReporter) return;
	win.__threeErrorReporter = true;

	// The reporter exists to surface *production* faults. In local dev and sandbox
	// previews (Codespaces, Gitpod, LAN) the Vite dev server proxies every /api/*
	// call straight to production, so a POST here would inject localhost noise —
	// failed Vite HMR sockets, headless-audit rejections — into the prod function
	// logs where it's indistinguishable from real incidents. Disable the whole
	// pipeline on those origins; the browser console already shows dev errors.
	const host = location.hostname;
	const IS_DEV_HOST =
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '0.0.0.0' ||
		host === '[::1]' ||
		host === '::1' ||
		host.endsWith('.local') ||
		host.endsWith('.app.github.dev') || // GitHub Codespaces forwarded ports
		host.endsWith('.gitpod.io') ||
		host.endsWith('.csb.app') ||
		/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host); // private LAN
	if (IS_DEV_HOST) {
		// Keep the manual hook callable so app code that invokes it never throws.
		win.reportClientError = () => {};
		return;
	}

	const ENDPOINT = '/api/client-errors';
	const MAX_EVENTS_PER_PAGE = 25; // hard cap so an error loop can't flood the API
	const MAX_PER_SIGNATURE = 3; // identical errors beyond this only bump `count`
	const MAX_BATCH = 10; // flush early once this many events are queued
	const FLUSH_DELAY_MS = 3000;
	const LIMITS = { message: 500, stack: 4000, url: 500, name: 100 };

	// Browser-extension frames and well-known benign browser noise. The two
	// ResizeObserver messages are spec-mandated, thrown by the browser itself,
	// and not actionable — every error pipeline ignores them.
	const IGNORED_SOURCES = /^(chrome|moz|safari|safari-web)-extension:/;
	const IGNORED_MESSAGES = [
		'ResizeObserver loop limit exceeded',
		'ResizeObserver loop completed with undelivered notifications.',
	];
	// Analytics/telemetry endpoints that privacy extensions (uBlock, Brave,
	// Ghostery…) routinely block. A blocked tracker is the client's choice, not
	// a site fault — the underlying SDKs degrade silently, so the only artifact
	// is a noisy "failed to load script" we don't want flooding the logs.
	const IGNORED_RESOURCE_SOURCES =
		/\/_vercel\/(insights|speed-insights)\/|\/ingest\/|\.i\.posthog\.com\//;
	// Exceptions thrown *inside* third-party CDN libraries we load but don't
	// control. model-viewer (served from ajax.googleapis.com) throws internally
	// when the browser can't give it a WebGL context — context budget exhausted,
	// GPU blocklist, headless. It degrades to its poster on its own; the throw is
	// neither our bug nor fixable from here, so it only adds noise. Vercel's
	// insights script likewise throws in stripped-down in-app webviews (e.g.
	// "history.pushState is undefined" inside wallet browsers) — analytics
	// degrading on an exotic UA is not actionable.
	const IGNORED_THIRD_PARTY_CODE =
		/ajax\.googleapis\.com\/ajax\/libs\/model-viewer\/|\/_vercel\/(insights|speed-insights)\/script/;
	// Expiring signed URLs embedded in user-generated feed data: GitHub
	// private-user-images, S3/GCS presigned links, and anything carrying a
	// short-lived JWT/signature. The token lapses on a timer, so the asset 404s
	// through no fault of our code, and the UI already swaps in an onerror
	// fallback tile. These are guaranteed-transient and non-actionable.
	const IGNORED_EPHEMERAL_ASSETS =
		/private-user-images\.githubusercontent\.com|[?&](jwt|X-Amz-Signature|X-Goog-Signature|Expires|Signature)=/i;
	// Vite's HMR client (and React Fast Refresh) raise dev-only rejections such as
	// "WebSocket closed without opened" when the HMR socket can't connect. These
	// only ever occur off a dev build; on the off chance a preview surfaces one,
	// it is tooling noise, never a product fault.
	const IGNORED_DEV_TOOLING = /\/@vite\/client|\/@react-refresh|vite\/dist\/client/;

	const truncate = (value, max) => {
		if (typeof value !== 'string' || !value) return undefined;
		return value.length > max ? `${value.slice(0, max)}…` : value;
	};

	const signatures = new Map(); // signature → report (so repeats bump count)
	let totalAccepted = 0;
	let queue = [];
	let flushTimer = null;

	function normalize(raw) {
		if (!raw || typeof raw !== 'object') return null;
		if (raw.type === 'unhandledrejection') {
			const reason = raw.reason;
			const isError = reason instanceof Error;
			return {
				type: 'unhandledrejection',
				name: isError ? reason.name : undefined,
				message: isError
					? reason.message
					: typeof reason === 'string'
						? reason
						: safeStringify(reason),
				stack: isError ? reason.stack : undefined,
			};
		}
		if (raw.type === 'error') {
			// Resource load failures (script/img/css 404s) arrive as plain Events
			// on the element, seen only because the bootstrap listens in the
			// capture phase. Uncaught JS errors arrive as ErrorEvents on window.
			const target = raw.target;
			if (target && target !== window && target.nodeName) {
				const url = target.src || target.href;
				if (!url || typeof url !== 'string') return null;
				// The element wires its own onerror handler (gallery posters swap to
				// a gradient tile, avatars fall back to an initial) — the app already
				// owns and recovers from this load failure, so reporting it again as
				// an uncaught resource error is double-counting transient, handled
				// noise. Genuinely unhandled resource 404s still surface.
				if (typeof target.onerror === 'function') return null;
				return {
					type: 'resource',
					tag: target.nodeName.toLowerCase(),
					message: `failed to load ${target.nodeName.toLowerCase()}`,
					source: url,
				};
			}
			if (typeof raw.message !== 'string') return null;
			return {
				type: 'error',
				name: raw.error && raw.error.name,
				message: raw.message,
				source: raw.filename,
				line: raw.lineno,
				col: raw.colno,
				stack: raw.error && raw.error.stack,
			};
		}
		return null;
	}

	function safeStringify(value) {
		try {
			return JSON.stringify(value) ?? String(value);
		} catch {
			return String(value);
		}
	}

	function shouldIgnore(report) {
		if (!report.message && !report.source) return true;
		if (report.source && IGNORED_SOURCES.test(report.source)) return true;
		if (report.stack && /\b(chrome|moz|safari|safari-web)-extension:\/\//.test(report.stack)) {
			return true;
		}
		if (report.message && IGNORED_MESSAGES.includes(report.message)) return true;
		// Internal failures of a third-party CDN library (identified by the script
		// they originate from, via either the error's source or its stack) are not
		// actionable from our code.
		if (
			IGNORED_THIRD_PARTY_CODE.test(report.source || '') ||
			IGNORED_THIRD_PARTY_CODE.test(report.stack || '')
		) {
			return true;
		}
		// Dev-tooling rejections (Vite HMR / Fast Refresh) — never a product fault.
		if (
			IGNORED_DEV_TOOLING.test(report.source || '') ||
			IGNORED_DEV_TOOLING.test(report.stack || '')
		) {
			return true;
		}
		// A failed service-worker *registration* is a transient network/iOS-Safari
		// hiccup; VitePWA's autoUpdate re-registers on the next visit, so it
		// self-heals — noise, not an actionable fault. iOS Safari surfaces it two
		// ways: "Script …/sw.js load failed" and "Failed to register a
		// ServiceWorker … An unknown error occurred when fetching the script."
		if (
			report.message &&
			(/sw\.js\b[^]*load failed|load failed[^]*\bsw\.js\b/i.test(report.message) ||
				/failed to register a serviceworker/i.test(report.message) ||
				/error occurred when fetching the script/i.test(report.message))
		) {
			return true;
		}
		if (report.type === 'resource' && report.source) {
			// A cross-origin resource that fails to load is outside our control: the
			// Cloudflare Turnstile/CAPTCHA script Privy pulls from
			// challenges.cloudflare.com, a third-party embed, a wallet in-app webview
			// blocking an external host, or a user's network dropping a request to
			// someone else's CDN. We serve our own assets correctly but cannot fix a
			// third party's CDN or a user's blocker, so a cross-origin resource
			// failure is noise, not an actionable site fault. Every first-party asset
			// — including the /cdn proxy — is same-origin, so genuine 404s on our own
			// files (e.g. /three.svg) still report.
			if (isThirdPartyResource(report.source)) return true;
			// A <model-viewer> whose mesh fails to load (slow/aborted GLB fetch
			// under mobile memory or network pressure, a lost WebGL context) fires
			// a resource error but degrades to its poster on its own — the user
			// still sees the model's image. The object itself is served fine (the
			// gallery only lists rows with a stored GLB); this is a transient,
			// self-healing client condition, not a missing asset. Drop the noise.
			if (report.tag === 'model-viewer') return true;
			// Privacy-blocker-killed analytics — expected, not actionable.
			if (IGNORED_RESOURCE_SOURCES.test(report.source)) return true;
			// Expired signed URLs on third-party user-content — transient by design.
			if (IGNORED_EPHEMERAL_ASSETS.test(report.source)) return true;
			// An <img src=""> (or a src that resolves to the page itself) is an
			// element with no real source, not a missing asset. The browser still
			// fires a load error for it; classify it as benign rather than a 404.
			if (isCurrentPage(report.source)) return true;
		}
		return false;
	}

	// True when `url` is the current document URL ignoring the fragment — the
	// resolved value of an element whose src/href attribute is empty.
	function isCurrentPage(url) {
		const strip = (u) => String(u).split('#')[0];
		return strip(url) === strip(location.href);
	}

	// True when a resource URL points at a different origin than the page. Used to
	// drop cross-origin (third-party) resource-load failures we can't act on. An
	// unparseable URL is treated as third-party — it isn't one of our own assets.
	function isThirdPartyResource(url) {
		try {
			return new URL(url, location.href).origin !== location.origin;
		} catch {
			return true;
		}
	}

	function enqueue(report) {
		if (totalAccepted >= MAX_EVENTS_PER_PAGE || shouldIgnore(report)) return;
		const signature = [report.type, report.message, report.source, report.line].join('|');
		const seen = signatures.get(signature);
		if (seen) {
			seen.count += 1;
			if (seen.count > MAX_PER_SIGNATURE) return; // counted, not re-sent
		} else {
			report.count = 1;
			signatures.set(signature, report);
		}
		totalAccepted += 1;
		queue.push({
			type: report.type,
			name: truncate(report.name, LIMITS.name),
			message: truncate(report.message, LIMITS.message),
			source: truncate(report.source, LIMITS.url),
			line: Number.isFinite(report.line) ? report.line : undefined,
			col: Number.isFinite(report.col) ? report.col : undefined,
			stack: truncate(report.stack, LIMITS.stack),
			tag: report.tag,
			ts: Date.now(),
		});
		if (queue.length >= MAX_BATCH) {
			flush();
		} else if (!flushTimer) {
			flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
		}
	}

	function flush() {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		if (!queue.length) return;
		const payload = JSON.stringify({
			page: truncate(location.href, LIMITS.url),
			referrer: truncate(document.referrer, LIMITS.url) || undefined,
			viewport: { w: window.innerWidth, h: window.innerHeight },
			events: queue,
		});
		queue = [];
		try {
			// sendBeacon survives page unload and never blocks the main thread;
			// keepalive fetch is the fallback for browsers that reject the Blob.
			const blob = new Blob([payload], { type: 'application/json' });
			if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
		} catch {
			/* fall through to fetch */
		}
		try {
			fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: payload,
				keepalive: true,
			}).catch(() => {});
		} catch {
			/* reporting must never throw */
		}
	}

	function handleRaw(raw) {
		try {
			const report = normalize(raw);
			if (report) enqueue(report);
		} catch {
			/* never let the reporter become the error */
		}
	}

	// Drain events the inline bootstrap queued before this file loaded, then
	// take over its queue so the bootstrap's listeners feed us directly.
	const bootQueue = (win.__threeErrQ = win.__threeErrQ || []);
	const backlog = bootQueue.splice(0);
	bootQueue.push = (raw) => {
		handleRaw(raw);
		return 0;
	};
	backlog.forEach(handleRaw);

	// Standalone usage (a page that includes this file without the Vite-injected
	// bootstrap): install the listeners ourselves.
	if (!win.__threeErrCap) {
		win.__threeErrCap = 1;
		window.addEventListener('error', handleRaw, true);
		window.addEventListener('unhandledrejection', handleRaw);
	}

	// Manual reporting hook for app code: window.reportClientError(err, { ...context })
	win.reportClientError = (err, context) => {
		try {
			const isError = err instanceof Error;
			enqueue({
				type: 'manual',
				name: isError ? err.name : undefined,
				message: isError ? err.message : typeof err === 'string' ? err : safeStringify(err),
				stack: isError ? err.stack : undefined,
				source: context && typeof context === 'object' ? safeStringify(context) : undefined,
			});
		} catch {
			/* never throw */
		}
	};

	// Ship whatever is still queued when the user leaves the page.
	addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
	addEventListener('pagehide', flush);
})();
