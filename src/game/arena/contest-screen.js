// Contest Screen — a live in-world jumbotron for an Omniology contest.
//
// The Arena's walls carry physical LED screens that show Omniology's live
// contests: the current round with its ~88-second countdown, a leaderboard, the
// recent winners, and a live ticker of entries landing in real time. Each screen
// is an HTML canvas wrapped in a CanvasTexture on an unlit plane — a real object
// in the 3D world you can walk up to and click, not a DOM overlay. The canvas
// repaints in place (~10fps) as the countdown ticks and the feed updates.
//
// This generalizes src/game/chart-screen.js: same CanvasTexture-on-PlaneGeometry
// rig, same poll-driven state machine, same designed loading / live / empty /
// error states — adapted to contests. One component handles all three wall roles
// (now-playing, leaderboard, winners) via the `role` option; the dominant panel
// changes per role but every screen shares the header, LIVE badge, countdown, and
// ticker. Data is real, normalized by omniology-adapter.js — no mocks (CLAUDE.md).
//
// Contract: docs/omniology-arena/CONTRACTS.md §2.2.

import {
	Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
	PlaneGeometry, BoxGeometry,
	CanvasTexture, SRGBColorSpace, DoubleSide,
} from 'three';

const CW = 1280, CH = 720;       // 16:9 canvas backing the screen
const REDRAW_MS = 100;           // ~10fps redraw — smooth ticker, cheap on the GPU
const TICKER_CAP = 24;           // recent entries kept for the scrolling ticker
const SWEEP_S = 1.4;             // "NEW ROUND" sweep duration when the round flips

// Restrained, premium palette — light-on-near-black to match the world UI, with a
// single directional accent that shifts as the countdown runs low.
const COL = {
	bg0: '#08080b', bg1: '#101015',
	panel: 'rgba(255,255,255,0.04)',
	stroke: 'rgba(255,255,255,0.10)',
	grid: 'rgba(255,255,255,0.06)',
	text: '#f5f5f6', dim: '#9a9aa2', faint: '#5a5a62',
	live: '#5fd08a', warn: '#f2c14e', danger: '#e06c75',
	accent: '#7cc4ff',
};

// ── pure helpers (exported for unit tests — no canvas/DOM needed) ───────────────

/**
 * Format a millisecond duration as a contest clock: M:SS, floored at 0:00.
 * @param {number|null} ms
 * @returns {string}
 */
export function formatCountdown(ms) {
	if (ms == null || !Number.isFinite(ms)) return '—:—';
	const total = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Countdown accent: calm → amber → red as the round closes. Thresholds are tuned
 * to the ~88s cadence (last 18s warn, last 8s danger).
 * @param {number|null} remainingMs
 * @returns {string}
 */
export function countdownColor(remainingMs) {
	if (remainingMs == null || !Number.isFinite(remainingMs)) return COL.dim;
	if (remainingMs <= 8000) return COL.danger;
	if (remainingMs <= 18000) return COL.warn;
	return COL.live;
}

/**
 * Merge incoming ticker entries (newest-first) ahead of the existing buffer,
 * deduped by entryId, capped. Optimistic inserts (from the desk) and feed entries
 * both flow through here so the ticker never double-counts a submission.
 * @param {Array} existing  current buffer (newest-first)
 * @param {Array} incoming  new entries to fold in
 * @param {number} [cap]
 * @returns {Array}
 */
export function mergeTicker(existing, incoming, cap = TICKER_CAP) {
	const out = [];
	const seen = new Set();
	for (const e of [...incoming, ...existing]) {
		if (!e) continue;
		const key = e.entryId || `${e.agent}:${e.submittedMs}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(e);
	}
	out.sort((a, b) => (b.submittedMs || 0) - (a.submittedMs || 0));
	return out.slice(0, cap);
}

function fmtUsdc(v) {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return '—';
	if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	return '$' + n.toFixed(n < 10 ? 2 : 1);
}

function fmtScore(v) {
	const n = Number(v);
	if (!Number.isFinite(n)) return '—';
	return n <= 1 ? n.toFixed(3) : n.toFixed(1);
}

function relTime(ms, now) {
	const s = Math.max(0, Math.round((now - ms) / 1000));
	if (s < 4) return 'now';
	if (s < 60) return s + 's';
	const m = Math.round(s / 60);
	return m < 60 ? m + 'm' : Math.round(m / 60) + 'h';
}

function ellipsize(ctx, text, maxW) {
	if (ctx.measureText(text).width <= maxW) return text;
	let t = text;
	while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
	return t + '…';
}

function roundRect(ctx, x, y, w, h, r) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

function monogram(name) {
	const s = String(name || '?').trim();
	return (s[0] || '?').toUpperCase();
}

// ── factory ────────────────────────────────────────────────────────────────────

/**
 * Build a live contest screen and add it to the scene.
 * @param {THREE.Scene} scene
 * @param {{position:[number,number,number]|{x,y,z}, width?:number, rotationY?:number, role?:'now'|'leaderboard'|'winners', frame?:boolean}} opts
 * @returns {{group, mesh, role, update, applyFeed, pushEntry, setStatus, openExternal, dispose}}
 */
export function createContestScreen(scene, opts = {}) {
	const role = opts.role === 'leaderboard' || opts.role === 'winners' ? opts.role : 'now';
	const width = opts.width || 12;
	const height = (width * CH) / CW;
	const rotationY = opts.rotationY || 0;
	const pos = toXYZ(opts.position, [0, 0, 0]);

	const group = new Group();
	group.position.set(pos[0], pos[1], pos[2]);
	group.rotation.y = rotationY;

	// Optional bezel + posts so a free-standing screen reads as a real rig. When a
	// venue wall already frames the panel (the common Arena case), pass frame:false
	// to mount just the lit face flush to the wall.
	if (opts.frame !== false) {
		const bezel = new Mesh(
			new BoxGeometry(width + 0.5, height + 0.5, 0.3),
			new MeshStandardMaterial({ color: 0x050506, roughness: 0.4, metalness: 0.7 }),
		);
		bezel.position.set(0, 0, -0.18);
		bezel.castShadow = true;
		group.add(bezel);
	}

	// Live face: canvas → CanvasTexture → unlit plane (glows like an LED wall).
	const canvas = document.createElement('canvas');
	canvas.width = CW; canvas.height = CH;
	const ctx = canvas.getContext('2d');
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 4;
	const panel = new Mesh(
		new PlaneGeometry(width, height),
		new MeshBasicMaterial({ map: tex, side: DoubleSide, toneMapped: false }),
	);
	panel.userData.contestScreen = true; // raycast tag
	group.add(panel);

	scene.add(group);

	// ── live state ──────────────────────────────────────────────────────────────
	let feed = null;            // latest NormalizedFeed
	let status = 'loading';     // loading | live | empty | error | unconfigured
	let ticker = [];            // newest-first entry buffer for the scroll
	let thumbs = new Map();     // entryId → HTMLImageElement (lazy, CORS-safe)
	let skewMs = 0;             // serverNow - clientNow at last applyFeed (drift)
	let closesMs = null;        // current round close (server clock)
	let lastRound = null;       // for round-flip detection
	let sweepT = 0;             // remaining "NEW ROUND" sweep seconds
	let t = 0;                  // elapsed seconds (pulse + ticker scroll)
	let acc = 0;                // redraw accumulator
	let destroyed = false;

	function correctedNow() { return Date.now() + skewMs; }
	function remainingMs() { return closesMs == null ? null : closesMs - correctedNow(); }

	// Lazily load a leaderboard thumbnail; the row renders its monogram until the
	// image lands, and silently keeps the monogram if the load is blocked.
	function ensureThumb(entryId, url) {
		if (!url || thumbs.has(entryId)) return;
		const im = new Image();
		im.crossOrigin = 'anonymous';
		im.referrerPolicy = 'no-referrer';
		im.onload = () => { thumbs.set(entryId, im); };
		im.onerror = () => { thumbs.set(entryId, null); };
		thumbs.set(entryId, null); // reserve the slot so we don't re-request
		im.src = url;
	}

	// ── public surface ────────────────────────────────────────────────────────
	function applyFeed(next) {
		if (!next) return;
		feed = next;
		skewMs = Number(next.serverNowMs) - Date.now();

		if (next.ok === false) {
			status = next.reason === 'unconfigured' ? 'unconfigured' : 'error';
			closesMs = null;
			return;
		}

		const cur = next.current;
		closesMs = cur ? cur.closesMs : null;

		// Round flip → trigger the "NEW ROUND" sweep (skip the very first feed).
		if (cur && cur.round != null && lastRound != null && cur.round !== lastRound) {
			sweepT = SWEEP_S;
			ticker = []; // a fresh round starts its ticker clean
		}
		if (cur && cur.round != null) lastRound = cur.round;

		// Fold the feed's recent entries into the ticker (dedupe vs optimistic).
		ticker = mergeTicker(ticker, next.recentEntries || [], TICKER_CAP);
		for (const e of next.leaderboard || []) ensureThumb(e.entryId, e.thumbUrl);

		status = cur ? 'live' : 'empty';
	}

	// Optimistic ticker insert, called by the entry desk (prompt 04) the instant a
	// submission settles — so the submitter sees their entry before the next poll.
	function pushEntry(entry) {
		if (!entry) return;
		const e = {
			entryId: entry.entryId || `local:${Math.round(correctedNow())}`,
			agent: entry.agent || 'you',
			submittedMs: entry.submittedMs || correctedNow(),
			optimistic: true,
		};
		ticker = mergeTicker(ticker, [e], TICKER_CAP);
	}

	function setStatus(s) {
		if (['loading', 'live', 'empty', 'error', 'unconfigured'].includes(s)) status = s;
	}

	// ── rendering ───────────────────────────────────────────────────────────────
	function paintBackground() {
		const bg = ctx.createLinearGradient(0, 0, 0, CH);
		bg.addColorStop(0, COL.bg1); bg.addColorStop(1, COL.bg0);
		ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
		// subtle vignette frame
		ctx.strokeStyle = COL.stroke; ctx.lineWidth = 2;
		ctx.strokeRect(10, 10, CW - 20, CH - 20);
	}

	function paintHeader() {
		const padX = 44;
		const cur = feed?.current;
		ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

		// Role label + contest title.
		const roleLabel = role === 'leaderboard' ? 'LEADERBOARD' : role === 'winners' ? 'PAST WINNERS' : 'NOW PLAYING';
		ctx.fillStyle = COL.accent;
		ctx.font = '800 18px Inter, system-ui, sans-serif';
		ctx.fillText(roleLabel, padX, 44);

		ctx.fillStyle = COL.text;
		ctx.font = '800 34px Inter, system-ui, sans-serif';
		const title = cur ? cur.title : 'Omniology Arena';
		ctx.fillText(ellipsize(ctx, title.toUpperCase(), 720), padX, 80);

		if (cur && cur.round != null) {
			ctx.fillStyle = COL.dim;
			ctx.font = '600 20px Inter, system-ui, sans-serif';
			ctx.fillText(`ROUND ${cur.round}`, padX, 108);
		}

		// LIVE / status badge (top-right), pulsing dot.
		const pulse = 0.5 + 0.5 * Math.sin(t * 4);
		const label = status === 'live' ? 'LIVE'
			: status === 'error' ? 'RECONNECTING'
			: status === 'unconfigured' ? 'CONNECTING'
			: status === 'empty' ? 'STANDBY'
			: '···';
		ctx.font = '700 18px Inter, system-ui, sans-serif';
		const badgeW = ctx.measureText(label).width + 64;
		const bx = CW - padX - badgeW, by = 26, bh = 40;
		roundRect(ctx, bx, by, badgeW, bh, 20);
		ctx.fillStyle = COL.panel; ctx.fill();
		ctx.strokeStyle = COL.stroke; ctx.lineWidth = 1; ctx.stroke();
		ctx.beginPath();
		ctx.arc(bx + 26, by + bh / 2, 6, 0, Math.PI * 2);
		const dot = status === 'live' ? `rgba(95,208,138,${pulse})`
			: status === 'error' ? COL.danger
			: status === 'unconfigured' ? `rgba(124,196,255,${pulse})`
			: COL.faint;
		ctx.fillStyle = dot; ctx.fill();
		ctx.fillStyle = COL.text;
		ctx.fillText(label, bx + 44, by + 26);
	}

	// Big countdown block, shared by the now-playing role and used compact in headers.
	function paintCountdown(x, y, scale = 1) {
		const rem = remainingMs();
		const col = countdownColor(rem);
		ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = COL.faint;
		ctx.font = `700 ${Math.round(16 * scale)}px Inter, system-ui, sans-serif`;
		ctx.fillText('CLOSES IN', x, y - Math.round(70 * scale));
		ctx.fillStyle = col;
		ctx.font = `800 ${Math.round(120 * scale)}px "SF Mono", ui-monospace, Menlo, monospace`;
		const txt = formatCountdown(rem);
		ctx.fillText(txt, x, y);
		// thin progress arc-ish bar under the clock showing the ~88s drain
		if (closesMs != null && feed?.current?.opensMs != null) {
			const dur = Math.max(1, closesMs - feed.current.opensMs);
			const frac = Math.max(0, Math.min(1, (rem ?? 0) / dur));
			const w = ctx.measureText(txt).width;
			const barY = y + Math.round(18 * scale), barH = Math.round(8 * scale);
			roundRect(ctx, x, barY, w, barH, barH / 2); ctx.fillStyle = COL.grid; ctx.fill();
			roundRect(ctx, x, barY, w * frac, barH, barH / 2); ctx.fillStyle = col; ctx.fill();
		}
	}

	function paintStatChip(x, y, w, label, value, accent) {
		roundRect(ctx, x, y, w, 92, 14);
		ctx.fillStyle = COL.panel; ctx.fill();
		ctx.strokeStyle = COL.stroke; ctx.lineWidth = 1; ctx.stroke();
		ctx.fillStyle = COL.faint; ctx.font = '700 15px Inter, system-ui, sans-serif';
		ctx.fillText(label, x + 18, y + 30);
		ctx.fillStyle = accent || COL.text; ctx.font = '800 40px Inter, system-ui, sans-serif';
		ctx.fillText(value, x + 18, y + 74);
	}

	function paintLeaderboardRows(x, y, w, rows, maxRows, compact) {
		const rh = compact ? 52 : 64;
		if (!rows.length) {
			ctx.fillStyle = COL.dim; ctx.font = '600 22px Inter, system-ui, sans-serif';
			ctx.fillText('No scored entries yet this round.', x, y + 40);
			return;
		}
		rows.slice(0, maxRows).forEach((e, i) => {
			const ry = y + i * rh;
			// rank pill
			ctx.fillStyle = i === 0 ? COL.warn : i === 1 ? COL.dim : i === 2 ? '#c98a5a' : COL.faint;
			ctx.font = `800 ${compact ? 22 : 26}px Inter, system-ui, sans-serif`;
			ctx.textAlign = 'right';
			ctx.fillText(String(e.rank ?? i + 1), x + 34, ry + (compact ? 30 : 36));
			ctx.textAlign = 'left';
			// thumb / monogram
			const av = compact ? 30 : 40, ax = x + 50, ay = ry + (compact ? 4 : 6);
			ctx.save();
			roundRect(ctx, ax, ay, av, av, 8); ctx.fillStyle = '#1a1a20'; ctx.fill(); ctx.clip();
			const im = thumbs.get(e.entryId);
			if (im) ctx.drawImage(im, ax, ay, av, av);
			else {
				ctx.fillStyle = COL.dim; ctx.font = `700 ${compact ? 16 : 20}px Inter, system-ui, sans-serif`;
				ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				ctx.fillText(monogram(e.agent), ax + av / 2, ay + av / 2);
				ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
			}
			ctx.restore();
			// agent + score
			ctx.fillStyle = COL.text; ctx.font = `700 ${compact ? 22 : 26}px Inter, system-ui, sans-serif`;
			const nameX = ax + av + 16;
			ctx.fillText(ellipsize(ctx, e.agent, w - (nameX - x) - 120), nameX, ry + (compact ? 30 : 38));
			ctx.fillStyle = COL.accent; ctx.font = `800 ${compact ? 22 : 26}px "SF Mono", ui-monospace, monospace`;
			ctx.textAlign = 'right';
			ctx.fillText(fmtScore(e.score), x + w, ry + (compact ? 30 : 38));
			ctx.textAlign = 'left';
			if (i < Math.min(rows.length, maxRows) - 1) {
				ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
				ctx.beginPath(); ctx.moveTo(x, ry + rh - 6); ctx.lineTo(x + w, ry + rh - 6); ctx.stroke();
			}
		});
	}

	function paintWinnersRows(x, y, w) {
		const rows = feed?.recentWinners || [];
		if (!rows.length) {
			ctx.fillStyle = COL.dim; ctx.font = '600 22px Inter, system-ui, sans-serif';
			ctx.fillText('Winners appear here as rounds settle.', x, y + 40);
			return;
		}
		const rh = 70;
		rows.slice(0, 6).forEach((wn, i) => {
			const ry = y + i * rh;
			ctx.fillStyle = COL.faint; ctx.font = '700 16px Inter, system-ui, sans-serif';
			ctx.fillText(`ROUND ${wn.round}`, x, ry + 24);
			ctx.fillStyle = COL.text; ctx.font = '700 28px Inter, system-ui, sans-serif';
			ctx.fillText(ellipsize(ctx, wn.agent, w - 220), x, ry + 54);
			ctx.fillStyle = COL.live; ctx.font = '800 28px Inter, system-ui, sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(fmtUsdc(wn.prizeUsdc), x + w, ry + 44);
			ctx.textAlign = 'left';
			ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo(x, ry + rh - 8); ctx.lineTo(x + w, ry + rh - 8); ctx.stroke();
		});
	}

	function paintTicker() {
		const tickY = CH - 32, bandTop = CH - 64;
		ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, bandTop, CW, 64);
		ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(0, bandTop); ctx.lineTo(CW, bandTop); ctx.stroke();
		// "ENTRIES" tag
		const padX = 44;
		ctx.fillStyle = COL.accent; ctx.font = '800 16px Inter, system-ui, sans-serif';
		ctx.fillText('ENTRIES', padX, tickY + 6);
		const startX = padX + 96;
		ctx.save();
		ctx.beginPath(); ctx.rect(startX, bandTop, CW - startX - 20, 64); ctx.clip();
		const now = correctedNow();
		if (ticker.length) {
			ctx.font = '700 20px Inter, system-ui, sans-serif';
			const seg = ticker.map((e) => ({
				e,
				txt: `${e.agent}  ·  ${relTime(e.submittedMs, now)}`,
			}));
			const gap = 56;
			const widths = seg.map((s) => ctx.measureText(s.txt).width + gap + (s.e.optimistic ? 20 : 0));
			const total = widths.reduce((a, b) => a + b, 0) || 1;
			const scroll = (t * 70) % total;
			let x = startX - scroll;
			for (let pass = 0; pass < 2; pass++) {
				let xx = x + pass * total;
				seg.forEach((s, i) => {
					if (s.e.optimistic) {
						ctx.fillStyle = COL.live;
						ctx.beginPath(); ctx.arc(xx + 6, tickY - 6, 5, 0, Math.PI * 2); ctx.fill();
						xx += 20;
					}
					const dotX = xx;
					ctx.fillStyle = s.e.optimistic ? COL.live : COL.text;
					ctx.fillText(s.e.agent, dotX, tickY);
					const lead = ctx.measureText(s.e.agent).width;
					ctx.fillStyle = COL.dim;
					ctx.fillText(`  ·  ${relTime(s.e.submittedMs, now)}`, dotX + lead, tickY);
					xx += widths[i] - (s.e.optimistic ? 20 : 0);
				});
			}
		} else {
			ctx.fillStyle = COL.faint; ctx.font = '600 18px Inter, system-ui, sans-serif';
			ctx.fillText('Awaiting entries…', startX, tickY);
		}
		ctx.restore();
	}

	// Non-live states: skeleton (loading) and centered, calm messaging otherwise.
	function paintState() {
		const cx = CW / 2, midY = 300;
		if (status === 'loading') {
			// skeleton shimmer bars
			const sh = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(t * 3));
			ctx.fillStyle = `rgba(255,255,255,${sh})`;
			for (let i = 0; i < 4; i++) {
				roundRect(ctx, 44, 150 + i * 70, (CW - 88) * (i === 0 ? 0.5 : 0.9), 44, 10); ctx.fill();
			}
			ctx.fillStyle = COL.dim; ctx.font = '600 24px Inter, system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Loading live contest…', cx, CH - 120);
			ctx.textAlign = 'left';
			return;
		}

		const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
		let head, sub;
		if (status === 'unconfigured') {
			head = 'Connecting to Omniology';
			sub = 'Live contests will appear here once the feed is configured.';
		} else if (status === 'error') {
			head = `Reconnecting to Omniology${dots}`;
			sub = 'The contest feed is briefly unreachable. Retrying automatically.';
		} else {
			// empty / between rounds
			const next = feed?.next;
			const nextRem = next?.opensMs != null ? next.opensMs - correctedNow() : null;
			head = 'Between rounds';
			sub = nextRem != null && nextRem > 0
				? `Next round opens in ${formatCountdown(nextRem)}`
				: 'The next contest is about to begin.';
		}

		// pulsing ring as a calm "alive" signal
		const pulse = 0.5 + 0.5 * Math.sin(t * 3);
		ctx.beginPath();
		ctx.arc(cx, midY - 30, 26 + pulse * 4, 0, Math.PI * 2);
		ctx.strokeStyle = status === 'error' ? `rgba(224,108,117,${0.3 + pulse * 0.4})`
			: `rgba(124,196,255,${0.3 + pulse * 0.4})`;
		ctx.lineWidth = 3; ctx.stroke();

		ctx.textAlign = 'center';
		ctx.fillStyle = COL.text; ctx.font = '800 40px Inter, system-ui, sans-serif';
		ctx.fillText(head, cx, midY + 50);
		ctx.fillStyle = COL.dim; ctx.font = '500 24px Inter, system-ui, sans-serif';
		ctx.fillText(sub, cx, midY + 100);
		ctx.textAlign = 'left';
	}

	function paintSweep() {
		if (sweepT <= 0) return;
		const p = 1 - sweepT / SWEEP_S;        // 0 → 1 across the sweep
		const x = -CW + p * 2 * CW;             // band slides left→right
		ctx.save();
		const grad = ctx.createLinearGradient(x, 0, x + CW, 0);
		grad.addColorStop(0, 'rgba(124,196,255,0)');
		grad.addColorStop(0.5, 'rgba(124,196,255,0.18)');
		grad.addColorStop(1, 'rgba(124,196,255,0)');
		ctx.fillStyle = grad; ctx.fillRect(0, 0, CW, CH);
		const a = Math.sin(p * Math.PI); // fade in/out
		ctx.globalAlpha = a;
		ctx.fillStyle = COL.accent; ctx.font = '900 64px Inter, system-ui, sans-serif';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText('NEW ROUND', CW / 2, CH / 2);
		ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
		ctx.restore();
	}

	function draw() {
		paintBackground();
		paintHeader();

		// The winners panel keeps showing its list even between rounds (history
		// persists); every other role shows the designed state screen whenever the
		// feed isn't live (loading / empty / error / unconfigured).
		const winnersHaveHistory = role === 'winners' && (feed?.recentWinners?.length || 0) > 0;
		if (status !== 'live' && !winnersHaveHistory) {
			paintState();
			paintTicker();
			paintSweep();
			tex.needsUpdate = true;
			return;
		}

		const padX = 44, bodyTop = 150;
		if (role === 'leaderboard') {
			paintLeaderboardRows(padX, bodyTop, CW - padX * 2, feed?.leaderboard || [], 7, false);
		} else if (role === 'winners') {
			paintWinnersRows(padX, bodyTop, CW - padX * 2);
		} else {
			// now-playing: countdown + stat chips on the left, top-3 board on the right
			paintCountdown(padX, 300, 1);
			const chipW = (560 - 20) / 2;
			paintStatChip(padX, 360, chipW, 'PRIZE POOL', fmtUsdc(feed?.current?.prizeUsdc), COL.live);
			paintStatChip(padX + chipW + 20, 360, chipW, 'ENTRIES', String(feed?.current?.entriesCount ?? 0), COL.text);
			// right column: live top 3
			const rx = 700, rw = CW - rx - padX;
			ctx.fillStyle = COL.faint; ctx.font = '700 16px Inter, system-ui, sans-serif';
			ctx.fillText('TOP ENTRIES', rx, bodyTop - 12);
			paintLeaderboardRows(rx, bodyTop + 6, rw, feed?.leaderboard || [], 4, true);
		}

		paintTicker();
		paintSweep();
		tex.needsUpdate = true;
	}

	// first paint
	draw();

	return {
		group,
		mesh: panel,
		role,
		update(dt) {
			if (destroyed) return;
			t += dt;
			if (sweepT > 0) sweepT = Math.max(0, sweepT - dt);
			acc += dt;
			if (acc >= REDRAW_MS / 1000) { acc = 0; draw(); }
		},
		applyFeed,
		pushEntry,
		setStatus,
		openExternal() {
			window.open('https://omniology.ai', '_blank', 'noopener,noreferrer');
		},
		dispose() {
			destroyed = true;
			thumbs.clear();
			scene.remove(group);
			group.traverse((n) => {
				if (n.isMesh) {
					n.geometry?.dispose?.();
					const mats = Array.isArray(n.material) ? n.material : [n.material];
					for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.(); }
				}
			});
		},
	};
}

function toXYZ(p, fallback) {
	if (Array.isArray(p)) return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
	if (p && typeof p === 'object') return [p.x ?? 0, p.y ?? 0, p.z ?? 0];
	return fallback;
}
