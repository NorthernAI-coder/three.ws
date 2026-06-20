// curriculum.js — load the generated tour curriculum and own the cross-page
// tour state. The curriculum (what we visit + say) is built at deploy time by
// scripts/build-tour.mjs and served from /tour/curriculum.json. The live state
// (active? which stop? paused? muted?) lives in sessionStorage so the tour
// survives a full-page navigation between stops on different routes.

const CURRICULUM_URL = '/tour/curriculum.json';
const STATE_KEY = 'tws:tour:state';

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
	const p = pathname.replace(/\/+$/, '');
	return p === '' ? '/' : p;
}

const DEFAULT_STATE = { active: false, index: 0, paused: false, muted: false, voice: 'nova' };

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
	return next;
}

export function clearState() {
	try {
		sessionStorage.removeItem(STATE_KEY);
	} catch {
		/* ignore */
	}
}

// Index of the first stop on a given path, or -1. Used to snap the tour back
// onto the route when a visitor navigates by hand.
export function stopIndexForPath(curriculum, pathname = location.pathname) {
	const target = normalizePath(pathname);
	return curriculum.stops.findIndex((s) => normalizePath(s.path) === target);
}

export function sectionTitle(curriculum, id) {
	return curriculum.sections.find((s) => s.id === id)?.title || '';
}
