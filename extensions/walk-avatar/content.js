// content.js — injected into the host page to mount the walking avatar iframe.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) as a CLASSIC
// script (no ES modules), so the narrator is exposed on window by
// content-narrator.js (injected just before this file) rather than imported.
//
// Responsibilities: mount/unmount the avatar iframe, drag-to-reposition, a
// hover-revealed mute + close toolbar, live settings application, and relaying
// the iframe's postMessage events. Page narration is delegated to the Narrator.

(function () {
	'use strict';

	// Guard against double-injection on re-enable / SPA re-runs.
	if (window.__threewsWalkLoaded) return;
	window.__threewsWalkLoaded = true;

	const THREEWS = 'https://three.ws';
	const CONTAINER_ID = '__threews_walk_container__';

	let container = null;
	let iframe = null;
	let mounted = false;
	let narrator = null;
	let muted = false;
	let settings = {};
	let session = null;

	// Drag state
	let dragging = false;
	let dragOffX = 0;
	let dragOffY = 0;

	const SIZE_PRESETS = {
		small:  { width: 120, height: 180 },
		medium: { width: 180, height: 260 },
		large:  { width: 240, height: 340 },
	};

	function resolveSize(s) {
		if (s.sizePreset === 'custom') {
			return {
				width: clamp(parseInt(s.width, 10) || 180, 80, 600),
				height: clamp(parseInt(s.height, 10) || 260, 120, 800),
			};
		}
		return SIZE_PRESETS[s.sizePreset] || SIZE_PRESETS.medium;
	}

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	function buildEmbedSrc(avatarId) {
		const p = new URLSearchParams();
		if (avatarId) p.set('avatar', avatarId);
		p.set('controls', 'none');
		p.set('autoplay', 'true');
		p.set('ground', 'false');
		p.set('orbit', 'false');
		p.set('bg', 'transparent');
		return `${THREEWS}/walk-embed?${p.toString()}`;
	}

	function getPositionStyle(pos) {
		const m = '16px';
		switch (pos) {
			case 'top-left':    return { top: m, left: m, bottom: 'auto', right: 'auto' };
			case 'top-right':   return { top: m, right: m, bottom: 'auto', left: 'auto' };
			case 'bottom-left': return { bottom: m, left: m, top: 'auto', right: 'auto' };
			default:            return { bottom: m, right: m, top: 'auto', left: 'auto' };
		}
	}

	// ── Follow-cursor ──────────────────────────────────────────────────────────
	let followHandler = null;
	function enableFollowCursor() {
		disableFollowCursor();
		followHandler = (e) => {
			if (!container || dragging) return;
			const w = container.offsetWidth;
			const h = container.offsetHeight;
			const x = clamp(e.clientX + 24, 0, window.innerWidth - w);
			const y = clamp(e.clientY - h / 2, 0, window.innerHeight - h);
			container.style.left = x + 'px';
			container.style.top = y + 'px';
			container.style.right = 'auto';
			container.style.bottom = 'auto';
		};
		document.addEventListener('mousemove', followHandler, { passive: true });
	}
	function disableFollowCursor() {
		if (followHandler) {
			document.removeEventListener('mousemove', followHandler);
			followHandler = null;
		}
	}

	// ── Mount / unmount ──────────────────────────────────────────────────────────
	function mount(avatarId) {
		if (mounted) {
			if (iframe && avatarId) {
				iframe.contentWindow?.postMessage({ type: 'walk:setAvatar', id: avatarId }, THREEWS);
			}
			return;
		}

		const { width, height } = resolveSize(settings);
		const pos = settings.position || 'bottom-right';

		container = document.createElement('div');
		container.id = CONTAINER_ID;
		container.setAttribute('role', 'complementary');
		container.setAttribute('aria-label', 'three.ws walking avatar');
		container.style.cssText = `
			position: fixed;
			width: ${width}px;
			height: ${height}px;
			z-index: 2147483647;
			background: transparent;
			border-radius: 14px;
			overflow: visible;
			pointer-events: auto;
			filter: drop-shadow(0 10px 28px rgba(0,0,0,0.32));
		`;
		Object.assign(container.style, getPositionStyle(pos));

		// Hover toolbar (drag handle + mute + close)
		const toolbar = document.createElement('div');
		toolbar.style.cssText = `
			position: absolute;
			top: -2px; left: 0; right: 0;
			height: 26px;
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			padding: 0 4px;
			opacity: 0;
			transition: opacity 0.18s ease;
			z-index: 10;
		`;

		const grip = document.createElement('div');
		grip.title = 'Drag to move';
		grip.style.cssText = `
			flex: 1;
			height: 22px;
			cursor: grab;
			border-radius: 8px;
			background: rgba(0,0,0,0.22);
			backdrop-filter: blur(6px);
			-webkit-backdrop-filter: blur(6px);
		`;

		const muteBtn = iconButton(muteIcon(muted), muted ? 'Unmute narration' : 'Mute narration');
		muteBtn.id = '__threews_mute_btn__';
		muteBtn.addEventListener('click', toggleMute);

		const closeBtn = iconButton('×', 'Hide avatar');
		closeBtn.style.fontSize = '16px';
		closeBtn.addEventListener('click', () => unmount());

		toolbar.appendChild(grip);
		toolbar.appendChild(muteBtn);
		toolbar.appendChild(closeBtn);

		iframe = document.createElement('iframe');
		iframe.src = buildEmbedSrc(avatarId);
		iframe.title = 'three.ws walking avatar';
		iframe.allow = 'accelerometer; gyroscope; autoplay';
		iframe.setAttribute('scrolling', 'no');
		iframe.style.cssText = `
			width: 100%;
			height: 100%;
			border: 0;
			background: transparent;
			display: block;
			border-radius: 14px;
		`;

		container.appendChild(iframe);
		container.appendChild(toolbar);
		(document.body || document.documentElement).appendChild(container);
		mounted = true;

		container.addEventListener('mouseenter', () => { toolbar.style.opacity = '1'; });
		container.addEventListener('mouseleave', () => { toolbar.style.opacity = '0'; });

		grip.addEventListener('mousedown', startDrag);
		grip.addEventListener('touchstart', startDragTouch, { passive: false });

		window.addEventListener('message', onIframeMessage);

		// Apply runtime config once the embed signals readiness.
		applyLiveConfig();

		if (settings.position === 'follow-cursor') enableFollowCursor();

		// Start narration if enabled and motion is allowed.
		maybeStartNarrator();
	}

	function unmount() {
		if (!mounted) return;
		window.removeEventListener('message', onIframeMessage);
		disableFollowCursor();
		narrator?.stop();
		narrator = null;
		if (container && container.parentNode) container.parentNode.removeChild(container);
		container = null;
		iframe = null;
		mounted = false;
		window.__threewsWalkLoaded = false; // allow a clean re-mount later
	}

	function iconButton(label, title) {
		const b = document.createElement('button');
		b.type = 'button';
		b.title = title;
		b.setAttribute('aria-label', title);
		b.innerHTML = label;
		b.style.cssText = `
			width: 22px; height: 22px;
			border: 0;
			border-radius: 7px;
			background: rgba(0,0,0,0.34);
			color: rgba(255,255,255,0.86);
			font-size: 13px;
			line-height: 1;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			backdrop-filter: blur(6px);
			-webkit-backdrop-filter: blur(6px);
			padding: 0;
		`;
		b.addEventListener('mouseenter', () => { b.style.background = 'rgba(0,0,0,0.55)'; });
		b.addEventListener('mouseleave', () => { b.style.background = 'rgba(0,0,0,0.34)'; });
		return b;
	}

	function muteIcon(isMuted) {
		return isMuted
			? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
			: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
	}

	function toggleMute() {
		muted = !muted;
		const btn = document.getElementById('__threews_mute_btn__');
		if (btn) {
			btn.innerHTML = muteIcon(muted);
			btn.title = muted ? 'Unmute narration' : 'Mute narration';
			btn.setAttribute('aria-label', btn.title);
		}
		if (muted) narrator?.mute();
		else narrator?.unmute();
	}

	// ── Live config ──────────────────────────────────────────────────────────────
	function applyLiveConfig() {
		if (!iframe) return;
		const speed = settings.walkSpeed || 1;
		const send = () => {
			iframe.contentWindow?.postMessage({ type: 'walk:config', speed }, THREEWS);
			iframe.contentWindow?.postMessage({ type: 'walk:setMotion', motion: 'walk' }, THREEWS);
		};
		// The embed posts walk:ready when its scene is up; send immediately and
		// once more shortly after to cover the race before the listener attaches.
		send();
		setTimeout(send, 800);
	}

	function applySettings(next) {
		settings = { ...settings, ...next };
		if (!mounted || !container) return;

		const { width, height } = resolveSize(settings);
		container.style.width = width + 'px';
		container.style.height = height + 'px';

		if (settings.position === 'follow-cursor') {
			enableFollowCursor();
		} else {
			disableFollowCursor();
			Object.assign(container.style, getPositionStyle(settings.position || 'bottom-right'));
		}

		applyLiveConfig();
		maybeStartNarrator();
	}

	// ── Narrator ───────────────────────────────────────────────────────────────
	function maybeStartNarrator() {
		const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
		if (!settings.narrationEnabled || reduced) {
			narrator?.stop();
			narrator = null;
			return;
		}
		if (narrator) {
			narrator.refresh();
			return;
		}
		const NarratorClass = window.__ThreewsWalkNarrator;
		if (!NarratorClass) return;
		narrator = new NarratorClass({
			getIframe: () => iframe,
			getSession: () => session,
			getSettings: () => settings,
			isMuted: () => muted,
		});
		narrator.start();
	}

	// ── iframe → host relay ──────────────────────────────────────────────────────
	function onIframeMessage(e) {
		if (!iframe || e.source !== iframe.contentWindow) return;
		const data = e.data;
		if (!data || typeof data !== 'object') return;
		if (data.type === 'walk:ready') applyLiveConfig();
		// Surface avatar events to the host page for any listeners.
		try {
			document.dispatchEvent(new CustomEvent('threews-walk', { detail: data }));
		} catch {}
	}

	// SPA route changes don't disturb a fixed-position overlay, so no history
	// patching is needed — the container persists across pushState navigations.

	// ── Runtime messaging ────────────────────────────────────────────────────────
	chrome.runtime.onMessage.addListener((msg) => {
		switch (msg.type) {
			case 'walk:mount':
				loadContext().then(() => mount(msg.avatarId || settings.avatarId));
				break;
			case 'walk:unmount':
				unmount();
				break;
			case 'walk:setAvatar':
				if (iframe) iframe.contentWindow?.postMessage({ type: 'walk:setAvatar', id: msg.avatarId }, THREEWS);
				break;
			case 'walk:applySettings':
				applySettings(msg.settings || {});
				break;
			default:
				break;
		}
	});

	// Load cached settings + session before the first mount.
	async function loadContext() {
		const [{ threews_session }, sync] = await Promise.all([
			chrome.storage.local.get('threews_session'),
			chrome.storage.sync.get(null),
		]);
		session = threews_session || null;
		settings = { ...settings, ...sync };
	}
})();
