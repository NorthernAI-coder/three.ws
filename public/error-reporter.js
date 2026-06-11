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
	if (window.__threeErrorReporter) return;
	window.__threeErrorReporter = true;

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
		return false;
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
	const bootQueue = (window.__threeErrQ = window.__threeErrQ || []);
	const backlog = bootQueue.splice(0);
	bootQueue.push = (raw) => {
		handleRaw(raw);
		return 0;
	};
	backlog.forEach(handleRaw);

	// Standalone usage (a page that includes this file without the Vite-injected
	// bootstrap): install the listeners ourselves.
	if (!window.__threeErrCap) {
		window.__threeErrCap = 1;
		window.addEventListener('error', handleRaw, true);
		window.addEventListener('unhandledrejection', handleRaw);
	}

	// Manual reporting hook for app code: window.reportClientError(err, { ...context })
	window.reportClientError = (err, context) => {
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
