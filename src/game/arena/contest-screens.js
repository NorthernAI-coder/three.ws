// Contest Screens — the shared polling controller and arena mount helper.
//
// One poller serves every screen on the Arena's walls: it polls Omniology's live
// feed on an interval tuned to the ~88-second contest cadence, fans the same
// NormalizedFeed out to each screen's applyFeed(), and never issues a duplicate
// request per screen. It pauses while the tab is hidden (no point polling a feed
// nobody can see) and resumes — with an immediate catch-up poll — on focus. When
// it detects that the current round has just closed, it re-polls quickly to catch
// the flip to the next round so the countdown stays in sync across the boundary.
// On error it backs off, keeps retrying, and tells the screens to render their
// designed, auto-retrying error state.
//
// mountContestScreens() is the integration point the Arena bootstrap (prompt 01)
// calls: it creates one contest-screen per resolved venue anchor (prompt 02),
// registers each as an updatable so it redraws every frame, wires them to the
// single poller, and hands back a `pushEntry` so the entry desk (prompt 04) can
// optimistically push a settled submission to every screen.
//
// Contract: docs/omniology-arena/CONTRACTS.md §2.2, §2.4.

import { fetchLiveFeed } from './omniology-adapter.js';
import { createContestScreen } from './contest-screen.js';

const BASE_POLL_MS = 5000;       // steady-state cadence (the ~88s round repolls ~17×)
const FLIP_POLL_MS = 1500;       // fast repoll right after a detected round close
const ERROR_BASE_MS = 5000;      // first backoff step on error
const ERROR_MAX_MS = 30000;      // backoff ceiling
const FLIP_GRACE_MS = 4000;      // how long after close we keep fast-polling for the flip

/**
 * Create the single shared poller. Drives one in-flight request at a time and
 * pushes each NormalizedFeed to onFeed; routes errors to onError. Visibility-aware.
 *
 * @param {{ onFeed:(feed)=>void, onError:(err)=>void, pollMs?:number,
 *           getNow?:()=>number, fetchFeed?:()=>Promise<any> }} opts
 * @returns {{ start, stop, pollNow, dispose, isRunning }}
 */
export function createContestPoller(opts = {}) {
	const onFeed = typeof opts.onFeed === 'function' ? opts.onFeed : () => {};
	const onError = typeof opts.onError === 'function' ? opts.onError : () => {};
	const pollMs = opts.pollMs || BASE_POLL_MS;
	const now = opts.getNow || (() => Date.now());
	const doFetch = opts.fetchFeed || fetchLiveFeed;

	let timer = null;
	let inFlight = false;
	let destroyed = false;
	let running = false;
	let errorStreak = 0;
	let skewMs = 0;              // server - client drift, to time the round flip
	let closesMs = null;        // current round close on the server clock
	let visHandler = null;

	function correctedNow() { return now() + skewMs; }

	function schedule(ms) {
		clearTimeout(timer);
		if (destroyed || !running) return;
		timer = setTimeout(tick, ms);
	}

	// Decide the delay until the next poll. Around a round close we poll fast to
	// catch the flip; otherwise steady-state, unless we're backing off from errors.
	function nextDelay() {
		if (errorStreak > 0) return backoffDelay(errorStreak, ERROR_BASE_MS, ERROR_MAX_MS);
		if (closesMs != null) {
			const rem = closesMs - correctedNow();
			if (rem <= FLIP_GRACE_MS) return FLIP_POLL_MS; // closing / just closed
		}
		return pollMs;
	}

	async function tick() {
		if (destroyed || !running) return;
		if (isHidden()) return; // visibilitychange will resume us
		if (inFlight) { schedule(pollMs); return; }
		inFlight = true;
		try {
			const feed = await doFetch();
			errorStreak = 0;
			if (feed) {
				skewMs = Number(feed.serverNowMs) - now();
				closesMs = feed.current ? feed.current.closesMs : null;
				onFeed(feed);
			}
		} catch (err) {
			errorStreak += 1;
			onError(err);
		} finally {
			inFlight = false;
			schedule(nextDelay());
		}
	}

	function onVisibility() {
		if (destroyed || !running) return;
		if (isHidden()) {
			clearTimeout(timer); // pause — no polling while nobody's watching
		} else {
			pollNow();           // resume with an immediate catch-up
		}
	}

	function pollNow() {
		if (destroyed || !running) return;
		clearTimeout(timer);
		tick();
	}

	function start() {
		if (destroyed || running) return;
		running = true;
		if (typeof document !== 'undefined' && document.addEventListener) {
			visHandler = onVisibility;
			document.addEventListener('visibilitychange', visHandler);
		}
		pollNow();
	}

	function stop() {
		running = false;
		clearTimeout(timer);
	}

	function dispose() {
		destroyed = true;
		stop();
		if (visHandler && typeof document !== 'undefined' && document.removeEventListener) {
			document.removeEventListener('visibilitychange', visHandler);
		}
		visHandler = null;
	}

	return {
		start, stop, pollNow, dispose,
		isRunning: () => running,
	};
}

/**
 * Exponential backoff with a ceiling. attempt is 1-based (first error → base).
 * @param {number} attempt
 * @param {number} [base]
 * @param {number} [max]
 * @returns {number}
 */
export function backoffDelay(attempt, base = ERROR_BASE_MS, max = ERROR_MAX_MS) {
	const ms = base * Math.pow(2, Math.max(0, attempt - 1));
	return Math.min(max, ms);
}

function isHidden() {
	return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * Mount one contest-screen per Arena venue anchor and wire them all to one poller.
 * Called by the Arena bootstrap (prompt 01) once the venue anchors (prompt 02) are
 * resolved. Each anchor in `arena.anchors.screens[]` is `{ position, rotationY?,
 * width?, role? }`. By default the three walls take distinct roles (now-playing,
 * leaderboard, winners); pass `opts.roles` to override.
 *
 * @param {{ scene:THREE.Scene, anchors:{screens:Array}, registerUpdatable:(o)=>void }} arena
 * @param {{ roles?:string[], pollMs?:number, frame?:boolean }} [opts]
 * @returns {{ screens, poller, pushEntry:(entry)=>void, dispose:()=>void }}
 */
export function mountContestScreens(arena, opts = {}) {
	const anchors = arena?.anchors?.screens || [];
	const defaultRoles = opts.roles || ['now', 'leaderboard', 'winners'];

	const screens = anchors.map((a, i) => {
		const screen = createContestScreen(arena.scene, {
			position: a.position,
			rotationY: a.rotationY ?? 0,
			width: a.width,
			role: a.role || defaultRoles[i % defaultRoles.length],
			frame: opts.frame ?? a.frame,
		});
		screen.setStatus('loading');
		if (typeof arena.registerUpdatable === 'function') arena.registerUpdatable(screen);
		return screen;
	});

	// Track the latest feed so the entry desk (prompt 04) can read the live contest
	// id from the SAME poll the screens use — no second request to Omniology.
	let latestFeed = null;

	const poller = createContestPoller({
		pollMs: opts.pollMs,
		onFeed: (feed) => { latestFeed = feed; for (const s of screens) s.applyFeed(feed); },
		onError: () => { for (const s of screens) s.setStatus('error'); },
	});
	poller.start();

	return {
		screens,
		poller,
		// Optimistic insert from the entry desk (prompt 04) — show the entry on
		// every screen the instant a submission settles, before the next poll.
		pushEntry: (entry) => { for (const s of screens) s.pushEntry(entry); },
		// The live contest id (or null) from the latest poll — the desk's getContestId.
		getContestId: () => (latestFeed && latestFeed.current ? latestFeed.current.id : null),
		getCurrentFeed: () => latestFeed,
		dispose: () => {
			poller.dispose();
			for (const s of screens) s.dispose();
		},
	};
}
