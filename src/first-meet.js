/**
 * playFirstMeet — first-encounter celebration sequence for a newly generated avatar.
 *
 * @param {object} opts
 * @param {object} opts.viewer    — SceneController / AgentAvatar (duck-typed: .playClip(name) OR .mixer + .animations). Pass null if no 3D viewer.
 * @param {{ id: string, name: string }} opts.agent
 * @param {() => void} opts.onShare    — called when user clicks "Share"
 * @param {() => void} opts.onContinue — called when user clicks "Continue"
 * @returns {Promise<void>} resolves when user clicks either button
 */
import { log } from './shared/log.js';
export async function playFirstMeet({ viewer, agent, onShare, onContinue }) {
	const reducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

	// Inject stylesheet once
	if (!document.querySelector('link[data-fm-css]')) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = new URL('./first-meet.css', import.meta.url).href;
		link.dataset.fmCss = '1';
		document.head.appendChild(link);
	}

	// Build root overlay — a full-screen celebration sequence, not a classic dialog,
	// but acts as a modal region so screen readers treat it as one.
	const subtitleId = `fm-label-${Math.trunc(performance.now())}`;
	const root = document.createElement('div');
	root.className = 'first-meet-root';
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-modal', 'true');
	root.setAttribute('aria-labelledby', subtitleId);

	// Fade overlay (black → transparent) — decorative, hidden from AT
	const overlay = document.createElement('div');
	overlay.className = 'fm-fade-overlay';
	overlay.setAttribute('aria-hidden', 'true');

	// Subtitle — also serves as the accessible dialog label via aria-labelledby
	const subtitle = document.createElement('div');
	subtitle.className = 'fm-subtitle';
	subtitle.id = subtitleId;
	subtitle.textContent = `Hello, I'm ${agent?.name ?? 'your agent'}.`;

	// Action buttons
	const actions = document.createElement('div');
	actions.className = 'fm-actions';

	const btnShare = document.createElement('button');
	btnShare.className = 'fm-btn fm-btn-share';
	btnShare.textContent = 'Share';

	const btnContinue = document.createElement('button');
	btnContinue.className = 'fm-btn fm-btn-continue';
	btnContinue.textContent = 'Continue';

	actions.appendChild(btnShare);
	actions.appendChild(btnContinue);
	root.appendChild(overlay);
	root.appendChild(subtitle);
	root.appendChild(actions);
	document.body.appendChild(root);

	// ── Helpers ───────────────────────────────────────────────────────────────

	function delay(ms) {
		return new Promise((res) => setTimeout(res, ms));
	}

	// Try to play a wave gesture on the viewer (duck-typed).
	// Order probed:
	//   1. viewer.playClip('Wave') — exact name
	//   2. viewer.playClip('wave') — lowercase
	//   3. viewer.playAnimationByHint?.('wave') — partial name search (SceneController)
	//   4. Scripted bone tilt via viewer.mixer + content skeleton
	//      — bones probed: 'mixamorigRightHand', 'RightHand', 'mixamorigRightArm', 'RightArm'
	function tryWave() {
		if (reducedMotion || !viewer) return;

		// Method 1 & 2: direct clip by name
		if (typeof viewer?.playClip === 'function') {
			if (viewer.playClip('Wave')) return;
			if (viewer.playClip('wave')) return;
		}

		// Method 3: SceneController hint search
		if (typeof viewer?.playAnimationByHint === 'function') {
			if (viewer.playAnimationByHint('wave')) return;
			if (viewer.playAnimationByHint('Wave')) return;
		}

		// Method 4: scripted bone animation if mixer exists
		const mixer = viewer?.mixer;
		const root3d = viewer?.content ?? viewer?.scene;
		if (!mixer || !root3d) return;

		const BONE_NAMES = ['mixamorigRightHand', 'RightHand', 'mixamorigRightArm', 'RightArm'];
		let targetBone = null;
		root3d.traverse?.((obj) => {
			if (targetBone) return;
			if (obj.isBone && BONE_NAMES.includes(obj.name)) targetBone = obj;
		});
		if (!targetBone) return;

		// Simple scripted tilt: raise then return over 1.2s using rAF
		const origZ = targetBone.rotation.z;
		const origX = targetBone.rotation.x;
		const RAISE_Z = 1.2; // radians
		const RAISE_X = -0.5;
		const DURATION = 1200; // ms
		let start = null;

		function animateBone(ts) {
			if (!start) start = ts;
			const t = Math.min((ts - start) / DURATION, 1);
			// Ease in-out cubic
			const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			const wave = Math.sin(t * Math.PI); // arc: 0 → 1 → 0
			targetBone.rotation.z = origZ + RAISE_Z * wave * ease;
			targetBone.rotation.x = origX + RAISE_X * wave * ease;
			if (t < 1) requestAnimationFrame(animateBone);
			else {
				targetBone.rotation.z = origZ;
				targetBone.rotation.x = origX;
			}
		}
		requestAnimationFrame(animateBone);
	}

	// Spawn CSS confetti: 40–60 spans, random hue/size/rotation/position/duration
	function spawnConfetti() {
		if (reducedMotion) return;
		const count = 40 + Math.floor(Math.random() * 21);
		const pieces = [];
		for (let i = 0; i < count; i++) {
			const span = document.createElement('span');
			span.className = 'fm-confetti-piece';
			const hue = Math.floor(Math.random() * 360);
			const w = 6 + Math.random() * 8;
			const h = 10 + Math.random() * 10;
			const left = Math.random() * 100;
			const duration = 1.4 + Math.random() * 0.8;
			const delay_ = Math.random() * 0.4;
			const rot = Math.floor(Math.random() * 360);
			span.style.cssText = `
				left: ${left}%;
				width: ${w}px;
				height: ${h}px;
				background: hsl(${hue},80%,60%);
				transform: rotate(${rot}deg);
				animation-duration: ${duration}s;
				animation-delay: ${delay_}s;
			`.replace(/\s+/g, ' ');
			root.appendChild(span);
			pieces.push(span);
		}
		// Clean up after 2s
		setTimeout(() => pieces.forEach((p) => p.remove()), 2000);
	}

	// ── Sequence ──────────────────────────────────────────────────────────────

	// t=0.0 — fade overlay out (scene reveal)
	await delay(0);
	requestAnimationFrame(() => overlay.classList.add('fm-faded'));

	// t=0.2 — wave
	await delay(200);
	tryWave();

	// t=0.6 — subtitle fades in
	await delay(400);
	subtitle.classList.add('fm-visible');

	// t=1.4 — confetti burst
	await delay(800);
	spawnConfetti();

	// t=2.2 — buttons fade in
	await delay(800);
	actions.classList.add('fm-visible');

	// ── Wait for user ─────────────────────────────────────────────────────────

	await new Promise((resolve) => {
		function cleanup() {
			root.remove();
		}

		btnShare.addEventListener('click', () => {
			cleanup();
			onShare?.();
			resolve();
		});

		btnContinue.addEventListener('click', () => {
			cleanup();
			onContinue?.();
			// Launch guided tour unless already completed
			if (!localStorage.getItem(TOUR_DONE_KEY)) {
				runTour(agent).catch(log.error);
			}
			resolve();
		});
	});
}

// ── Tour constants ─────────────────────────────────────────────────────────────

const TOUR_DONE_KEY = 'threews:tour:done';

// ── Utility ───────────────────────────────────────────────────────────────────

function waitForEl(selector, timeoutMs = 3000) {
	return new Promise((resolve) => {
		const el = document.querySelector(selector);
		if (el) return resolve(el);
		const obs = new MutationObserver(() => {
			const found = document.querySelector(selector);
			if (found) { obs.disconnect(); resolve(found); }
		});
		obs.observe(document.body, { childList: true, subtree: true });
		setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
	});
}

function escHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}

// ── Coach-mark tour ───────────────────────────────────────────────────────────

async function runTour(agent) {
	if (localStorage.getItem(TOUR_DONE_KEY)) return;

	const STEPS = [
		{
			selectors: ['.dnx-hero-card'],
			title: 'Your agent is live',
			body: 'Click "Live page" to preview, "Edit" to customize the look, or "Embed" to deploy on any website.',
		},
		{
			selectors: ['#dnx-onboarding', '.dnx-ob'],
			title: 'Your setup checklist',
			body: 'Complete these steps to unlock your agent\'s full potential — from personality to payments.',
		},
		{
			selectors: ['.dnx-shortcuts-grid', '.dnx-quick-card'],
			title: 'Quick shortcuts',
			body: 'Shortcuts to your most-used tools. Pin any page from the directory below to customize this section.',
		},
	];

	// Screen-reader live region
	const liveRegion = document.createElement('div');
	liveRegion.className = 'fm-sr-only';
	liveRegion.setAttribute('aria-live', 'polite');
	liveRegion.setAttribute('aria-atomic', 'true');
	document.body.appendChild(liveRegion);

	// Spotlight rect highlight
	const spotlight = document.createElement('div');
	spotlight.className = 'fm-spotlight';
	spotlight.setAttribute('aria-hidden', 'true');
	document.body.appendChild(spotlight);

	// Tooltip bubble
	const bubble = document.createElement('div');
	bubble.className = 'fm-tour-bubble';
	bubble.setAttribute('role', 'dialog');
	bubble.setAttribute('aria-modal', 'false');
	bubble.setAttribute('aria-label', 'Guided tour');
	document.body.appendChild(bubble);

	let activeTarget = null;
	let stepIndex = 0;

	function finish() {
		liveRegion.remove();
		spotlight.remove();
		bubble.remove();
		if (activeTarget) activeTarget.removeAttribute('data-fm-tour-target');
		document.removeEventListener('keydown', keyHandler);
		localStorage.setItem(TOUR_DONE_KEY, '1');
		showChecklist(agent);
	}

	async function goToStep(idx) {
		if (idx >= STEPS.length) { finish(); return; }

		const step = STEPS[idx];
		stepIndex = idx;

		// Clear previous target
		if (activeTarget) activeTarget.removeAttribute('data-fm-tour-target');

		// Find target — try each selector, wait for first one
		let target = null;
		for (const sel of step.selectors) {
			target = document.querySelector(sel);
			if (target) break;
		}
		if (!target) {
			target = await waitForEl(step.selectors[0], 2000);
		}
		if (!target) {
			// Skip this step — element not available
			goToStep(idx + 1);
			return;
		}

		activeTarget = target;
		target.setAttribute('data-fm-tour-target', '');

		// Position spotlight over target
		const rect = target.getBoundingClientRect();
		const PAD = 8;
		spotlight.style.top = `${rect.top - PAD}px`;
		spotlight.style.left = `${rect.left - PAD}px`;
		spotlight.style.width = `${rect.width + PAD * 2}px`;
		spotlight.style.height = `${rect.height + PAD * 2}px`;
		spotlight.classList.add('fm-spotlight-on');

		// Render bubble
		const isLast = idx === STEPS.length - 1;
		bubble.innerHTML = `
			<div class="fm-tour-meta">${idx + 1} / ${STEPS.length}</div>
			<div class="fm-tour-title">${escHtml(step.title)}</div>
			<p class="fm-tour-body">${escHtml(step.body)}</p>
			<div class="fm-tour-nav">
				${idx > 0
					? `<button class="fm-tour-ghost" type="button" data-action="back" aria-label="Previous step">Back</button>`
					: ''}
				<button class="fm-tour-ghost fm-tour-skip" type="button" data-action="skip">Skip tour</button>
				<button class="fm-tour-primary" type="button" data-action="next">
					${isLast ? 'Done' : 'Next →'}
				</button>
			</div>
		`;

		// Position bubble near target
		positionBubble(bubble, rect);

		liveRegion.textContent = `Tour step ${idx + 1} of ${STEPS.length}: ${step.title}. ${step.body}`;

		// Wire buttons
		bubble.querySelector('[data-action="next"]').addEventListener('click', () => goToStep(idx + 1));
		bubble.querySelector('[data-action="skip"]').addEventListener('click', finish);
		const backBtn = bubble.querySelector('[data-action="back"]');
		if (backBtn) backBtn.addEventListener('click', () => goToStep(idx - 1));

		// Move focus to primary action
		bubble.querySelector('[data-action="next"]').focus();
	}

	function positionBubble(el, targetRect) {
		const bw = Math.min(300, window.innerWidth - 32);
		el.style.width = `${bw}px`;

		const preferredLeft = Math.min(
			Math.max(16, targetRect.left + targetRect.width / 2 - bw / 2),
			window.innerWidth - bw - 16,
		);
		el.style.left = `${preferredLeft}px`;

		const spaceBelow = window.innerHeight - targetRect.bottom;
		if (spaceBelow >= 160) {
			el.style.top = `${targetRect.bottom + 14}px`;
			el.style.bottom = '';
		} else {
			el.style.bottom = `${window.innerHeight - targetRect.top + 14}px`;
			el.style.top = '';
		}
	}

	function keyHandler(e) {
		if (e.key === 'Escape') finish();
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToStep(stepIndex + 1);
		if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && stepIndex > 0) goToStep(stepIndex - 1);
	}
	document.addEventListener('keydown', keyHandler);

	goToStep(0);
}

// ── Next-steps checklist ──────────────────────────────────────────────────────

function showChecklist(agent) {
	const agentId = agent?.id;
	const shareUrl = agentId ? `${location.origin}/agent/${agentId}` : null;

	const ITEMS = [
		{
			id: 'avatar',
			label: 'Customize your avatar',
			sub: 'Edit look, style, and accessories.',
			href: '/dashboard/avatars',
		},
		{
			id: 'personality',
			label: 'Add personality',
			sub: 'Set system prompt and AI model.',
			href: '/brain',
		},
		{
			id: 'payments',
			label: 'Enable payments',
			sub: 'Charge per message or set a subscription.',
			href: '/dashboard/monetize',
			optional: true,
		},
		{
			id: 'share',
			label: 'Share your agent',
			sub: shareUrl ? shareUrl.replace(/^https?:\/\//, '') : 'Copy the live link.',
			shareUrl,
		},
	];

	function getStored() {
		try { return JSON.parse(localStorage.getItem('threews:checklist') || '{}'); } catch { return {}; }
	}
	function setStored(obj) {
		localStorage.setItem('threews:checklist', JSON.stringify(obj));
	}

	const panel = document.createElement('div');
	panel.className = 'fm-checklist-panel';
	panel.setAttribute('role', 'region');
	panel.setAttribute('aria-label', 'Next steps checklist');

	let paymentsOpen = false;

	function render() {
		const stored = getStored();
		panel.innerHTML = `
			<div class="fm-cl-head">
				<span class="fm-cl-title">Next steps</span>
				<button class="fm-cl-dismiss" type="button" aria-label="Dismiss checklist">×</button>
			</div>
			<ul class="fm-cl-list" role="list">
				${ITEMS.map((item) => {
					const done = !!stored[item.id];
					return `
						<li class="fm-cl-item${done ? ' is-done' : ''}${item.optional ? ' is-optional' : ''}" data-item="${item.id}">
							<span class="fm-cl-check" aria-hidden="true">${done
								? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l2.5 2.5L10 3"/></svg>`
								: ''}</span>
							<div class="fm-cl-content">
								${item.optional ? `
									<button class="fm-cl-toggle" type="button" aria-expanded="${paymentsOpen}">
										${escHtml(item.label)}&nbsp;<span class="fm-cl-opt-tag">optional</span>
										<svg class="fm-cl-chevron${paymentsOpen ? ' open' : ''}" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 3.5l3 3 3-3"/></svg>
									</button>
									<div class="fm-cl-collapse${paymentsOpen ? ' open' : ''}">
										<div class="fm-cl-sub">${escHtml(item.sub)}</div>
										<a class="fm-cl-cta" href="${item.href}" data-action="${item.id}">Set up payments →</a>
									</div>
								` : item.shareUrl ? `
									<span class="fm-cl-label">${escHtml(item.label)}</span>
									<div class="fm-cl-sub fm-cl-mono">${escHtml(item.sub)}</div>
									<button class="fm-cl-copy" type="button" data-action="share" data-url="${escHtml(item.shareUrl)}">Copy link</button>
								` : `
									<a class="fm-cl-label fm-cl-link" href="${item.href}" data-action="${item.id}">${escHtml(item.label)}</a>
									<div class="fm-cl-sub">${escHtml(item.sub)}</div>
								`}
							</div>
						</li>
					`;
				}).join('')}
			</ul>
		`;

		// Dismiss
		panel.querySelector('.fm-cl-dismiss').onclick = () => {
			panel.classList.remove('fm-cl-visible');
			setTimeout(() => panel.remove(), 300);
		};

		// Payments accordion toggle
		const toggle = panel.querySelector('.fm-cl-toggle');
		if (toggle) {
			toggle.onclick = () => {
				paymentsOpen = !paymentsOpen;
				render();
			};
		}

		// Action clicks — mark items done on click-through
		panel.querySelectorAll('[data-action]').forEach((el) => {
			el.addEventListener('click', (e) => {
				const action = el.dataset.action;
				const stored = getStored();

				if (action === 'share') {
					e.preventDefault();
					const url = el.dataset.url;
					if (url) {
						navigator.clipboard?.writeText(url).then(() => {
							el.textContent = 'Copied!';
							setTimeout(() => { el.textContent = 'Copy link'; }, 2000);
						}).catch(() => {
							// Fallback: select text
							el.textContent = url;
							const range = document.createRange();
							range.selectNodeContents(el);
							window.getSelection()?.removeAllRanges();
							window.getSelection()?.addRange(range);
						});
					}
					stored.share = true;
					setStored(stored);
					render();
					return;
				}

				// Mark clicked item done (optimistic)
				if (['avatar', 'personality', 'payments'].includes(action)) {
					stored[action] = true;
					setStored(stored);
				}
				// Let link navigate
			});
		});
	}

	render();
	document.body.appendChild(panel);

	// Animate in on next frame
	requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('fm-cl-visible')));
}
