// /club door — the line outside the club.
//
// Before the velvet rope drops, you pay the cover via x402 and the bouncer
// checks the paying wallet on-chain (ban list + prior club activity). This
// module owns only the door overlay (#club-door) — the 3D club (src/club.js)
// boots in parallel behind it, so the queue covers the asset load and the
// room is already warm the moment you're admitted.
//
// Flow:  queue → [Pay cover] → x402 modal → checking → admitted | denied
//
// A paid wallet's pass is cached locally for its lifetime, so a reload within
// the night re-enters without paying again (the cover endpoint mirrors this
// with a SIWX free-re-entry grant for the same wallet).

import { log } from './shared/log.js';

const COVER_ENDPOINT = '/api/x402/club-cover';
const PASS_KEY = 'club:pass:v1';

const door = document.getElementById('club-door');
if (door) initDoor(door);

function initDoor(root) {
	const payBtn = root.querySelector('#club-door-pay');
	const msgEl = root.querySelector('#club-door-msg');
	const tierEl = root.querySelector('#club-door-tier');
	const backBtn = root.querySelector('#club-door-back');

	// Already paid cover tonight? Drop the rope immediately — no double charge.
	const cached = readPass();
	if (cached) {
		openDoor(root, { silent: true });
		return;
	}

	// The card stays hidden until you walk your avatar up to the door in the
	// alley (src/club-entrance.js → club:enter-door). Backing out (the card's
	// back button or Escape) returns control to the alley.
	setState(root, 'hidden');
	payBtn?.addEventListener('click', () => payCover(root, { payBtn, msgEl, tierEl }));

	window.addEventListener('club:enter-door', () => {
		if (root.dataset.state !== 'hidden') return;
		setState(root, 'queue');
		try { payBtn?.focus({ preventScroll: true }); } catch {}
	});

	const backToAlley = () => {
		setState(root, 'hidden');
		setMsg(msgEl, '', null);
		window.dispatchEvent(new CustomEvent('club:leave-door'));
	};
	backBtn?.addEventListener('click', backToAlley);
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && root.dataset.state === 'queue') backToAlley();
	});
}

async function payCover(root, { payBtn, msgEl, tierEl }) {
	if (!window.X402?.pay) {
		setMsg(msgEl, 'Wallet widget still loading — try again in a second.', 'warn');
		return;
	}

	setMsg(msgEl, '', null);
	setState(root, 'paying');
	payBtn.disabled = true;
	const originalLabel = payBtn.textContent;
	payBtn.textContent = 'Open wallet…';

	try {
		const out = await window.X402.pay({
			endpoint: COVER_ENDPOINT,
			method: 'GET',
			merchant: 'three.ws Pole Club',
			action: 'Cover charge — enter the club',
		});
		const pass = out?.result;
		if (!pass?.ok) throw new Error(pass?.error || 'cover did not settle');

		// Bouncer beat — give the "checking the list" state a moment to read.
		setState(root, 'checking');
		await wait(900);

		if (pass.admitted === false || pass.banned) {
			setState(root, 'denied');
			const reasonEl = root.querySelector('#club-door-reason');
			if (reasonEl) reasonEl.textContent = pass.reason || 'Not on the list tonight.';
			return;
		}

		// In. Cache the pass and announce the tier, then drop the rope.
		writePass(pass);
		if (tierEl) tierEl.textContent = welcomeFor(pass);
		setState(root, 'admitted');
		await wait(1100);
		openDoor(root);
	} catch (err) {
		// Cancelled wallet flow returns quietly to the queue; real errors show.
		if (err?.code === 'cancelled') {
			setState(root, 'queue');
			setMsg(msgEl, 'Cover not paid — you stayed in line.', 'info');
		} else {
			setState(root, 'queue');
			setMsg(msgEl, err?.message || 'Cover failed — try again.', 'error');
			log.warn('[club-gate] cover failed', err);
		}
	} finally {
		payBtn.disabled = false;
		payBtn.textContent = originalLabel;
	}
}

// Drop the velvet rope: fade the overlay out, then remove it so the club
// behind takes pointer + keyboard focus. `silent` skips the reveal beat for a
// cached pass on reload.
function openDoor(root, { silent = false } = {}) {
	root.classList.add('is-open');
	root.setAttribute('aria-hidden', 'true');
	const remove = () => {
		root.remove();
		// Send focus into the room.
		try { document.getElementById('club-stage')?.focus?.({ preventScroll: true }); } catch {}
		window.dispatchEvent(new CustomEvent('club:admitted'));
	};
	if (silent) {
		remove();
	} else {
		root.addEventListener('transitionend', remove, { once: true });
		// Failsafe if transitionend never fires (reduced-motion / display swap).
		setTimeout(remove, 900);
	}
}

function setState(root, state) {
	root.dataset.state = state;
}

function setMsg(el, text, kind) {
	if (!el) return;
	el.textContent = text || '';
	el.hidden = !text;
	if (kind) el.dataset.kind = kind;
	else delete el.dataset.kind;
}

function welcomeFor(pass) {
	const v = Number(pass.visits || 0);
	if (pass.tier === 'vip') return `VIP in the house — ${v} nights and counting. Welcome back.`;
	if (pass.tier === 'regular') return `Good to see you again — welcome back.`;
	return `First time? Welcome to the club.`;
}

// ── Local pass cache (per device, until the pass expires) ─────────────────
function readPass() {
	try {
		const raw = localStorage.getItem(PASS_KEY);
		if (!raw) return null;
		const pass = JSON.parse(raw);
		if (!pass?.expiresAt || Date.parse(pass.expiresAt) <= Date.now()) {
			localStorage.removeItem(PASS_KEY);
			return null;
		}
		return pass;
	} catch {
		return null;
	}
}

function writePass(pass) {
	try {
		localStorage.setItem(PASS_KEY, JSON.stringify({
			passId: pass.passId,
			tier: pass.tier,
			visits: pass.visits,
			expiresAt: pass.expiresAt,
		}));
	} catch {}
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
