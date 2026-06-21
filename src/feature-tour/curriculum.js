// curriculum.js — load the generated tour curriculum and own the cross-page
// tour state. The curriculum (what we visit + say) is built at deploy time by
// scripts/build-tour.mjs and served from /tour/curriculum.json. The live state
// (active? which stop? paused? muted?) lives in sessionStorage so the tour
// survives a full-page navigation between stops on different routes.

const CURRICULUM_URL = '/tour/curriculum.json';
const STATE_KEY = 'tws:tour:state'; // live, per-tab tour (sessionStorage)
const RESUME_KEY = 'tws:tour:resume'; // durable cross-session memory (localStorage)

let _cache = null;

export async function loadCurriculum() {
	if (_cache) return _cache;
	const res = await fetch(CURRICULUM_URL, { cache: 'force-cache' });
	if (!res.ok) throw new Error(`tour curriculum ${res.status}`);
	const data = await res.json();
	if (!data || !Array.isArray(data.stops) || !data.stops.length) {
		throw new Error('tour curriculum empty');
	}
	_cache = data;
	return data;
}

// Normalize a pathname to match curriculum stop paths ("/" stays "/", others
// lose any trailing slash). Query and hash are irrelevant to which stop we're on.
export function normalizePath(pathname = location.pathname) {
	// Strip query/hash first (a caller may hand us a full href) then trailing
	// slashes, so only the route path decides which stop we're on — as the
	// surrounding comments promise.
	const clean = String(pathname).split(/[?#]/)[0];
	const p = clean.replace(/\/+$/, '');
	return p === '' ? '/' : p;
}

const DEFAULT_STATE = {
	active: false,
	index: 0,
	track: 'full',
	paused: false,
	muted: false,
	voice: 'nova',
	speed: 1,
};

export function readState() {
	try {
		const raw = sessionStorage.getItem(STATE_KEY);
		if (!raw) return { ...DEFAULT_STATE };
		return { ...DEFAULT_STATE, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export function writeState(patch) {
	const next = { ...readState(), ...patch };
	try {
		sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
	} catch {
		/* private mode / disabled storage — tour still runs within this page */
	}
	// Mirror durable preferences + progress so a returning visitor (new tab,
	// next day) can pick the tour back up. The live sequencing still reads from
	// sessionStorage; this is the cross-session memory only.
	if (next.active) {
		writeResume({ index: next.index, track: next.track, voice: next.voice, speed: next.speed });
	}
	return next;
}

export function clearState() {
	try {
		sessionStorage.removeItem(STATE_KEY);
	} catch {
		/* ignore */
	}
}

// ── Cross-session memory (localStorage) ──────────────────────────────────────
// Remembers where a visitor got to and their voice/speed preferences across
// sessions, plus whether they've ever finished the tour. Never drives live
// sequencing — only the /tour page's "resume" / "completed" affordances and the
// director's preference defaults read it.
const DEFAULT_RESUME = { index: 0, track: 'full', voice: 'nova', speed: 1, completed: false };

export function readResume() {
	try {
		const raw = localStorage.getItem(RESUME_KEY);
		if (!raw) return { ...DEFAULT_RESUME };
		return { ...DEFAULT_RESUME, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULT_RESUME };
	}
}

export function writeResume(patch) {
	const next = { ...readResume(), ...patch };
	try {
		localStorage.setItem(RESUME_KEY, JSON.stringify(next));
	} catch {
		/* storage unavailable — cross-session resume simply won't persist */
	}
	return next;
}

export function markCompleted() {
	writeResume({ completed: true, index: 0 });
}

// ── Playlists ────────────────────────────────────────────────────────────────
// A track is a view over the curriculum: an ordered list of absolute stop
// indices to actually visit. 'full' is every stop; 'quick' is the highlighted
// heroes. Pure (no storage) so the sequencing logic and tests can build it
// freely. Always non-empty — an unknown track or a curriculum with no highlights
// falls back to the full list so the tour can never strand itself with nothing
// to play.
export function buildPlaylist(curriculum, track = 'full') {
	const all = curriculum.stops.map((_, i) => i);
	if (track !== 'quick') return all;
	const quick = all.filter((i) => curriculum.stops[i].highlight);
	return quick.length ? quick : all;
}

export function trackMeta(curriculum, track = 'full') {
	return (curriculum.tracks || []).find((t) => t.id === track) || null;
}

// Index of the first stop on a given path, or -1. Used to snap the tour back
// onto the route when a visitor navigates by hand.
export function stopIndexForPath(curriculum, pathname = location.pathname) {
	const target = normalizePath(pathname);
	return curriculum.stops.findIndex((s) => normalizePath(s.path) === target);
}

export function sectionTitle(curriculum, id) {
	return (curriculum.sections || []).find((s) => s.id === id)?.title || '';
}
