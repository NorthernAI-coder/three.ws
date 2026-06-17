// src/shared/leaflet-loader.js — single, lazy Leaflet stack + Nominatim helpers.
//
// One CDN version, one CSS injection, one in-flight promise — so every surface
// that needs a map (the IRL placement picker, the dashboard relocate modal, the
// My-pins overview) shares the same Leaflet instance and never ships a second map
// stack. Leaflet (JS + CSS) loads only when a map actually opens; the rest of the
// app never pays for it.

const LEAFLET_JS  = 'https://esm.sh/leaflet@1.9.4';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

let _cssPromise = null;
export function ensureLeafletCss() {
	if (_cssPromise) return _cssPromise;
	_cssPromise = new Promise((resolve, reject) => {
		if (document.getElementById('leaflet-css')) { resolve(); return; }
		const link = document.createElement('link');
		link.id = 'leaflet-css';
		link.rel = 'stylesheet';
		link.href = LEAFLET_CSS;
		link.crossOrigin = '';
		link.onload = () => resolve();
		link.onerror = () => { link.remove(); reject(new Error('leaflet css failed to load')); };
		document.head.appendChild(link);
	}).catch((e) => { _cssPromise = null; throw e; });
	return _cssPromise;
}

let _jsPromise = null;
export function loadLeaflet() {
	if (_jsPromise) return _jsPromise;
	_jsPromise = (async () => {
		const [mod] = await Promise.all([import(/* @vite-ignore */ LEAFLET_JS), ensureLeafletCss()]);
		const L = mod?.default || mod;
		if (!L || typeof L.map !== 'function') throw new Error('leaflet module missing');
		return L;
	})().catch((e) => { _jsPromise = null; throw e; });
	return _jsPromise;
}

// ── Nominatim geocoding (shared, memoized, polite) ──────────────────────────
// OSM's Nominatim is rate-limited and asks for a descriptive UA. We memoize per
// ~11 m cell and never let a geocode failure block the caller — a null label is
// a soft, designed state, never an error.

const _reverseCache = new Map();

// Reverse: coords → a short human place label (city/town/first display part).
export async function reverseGeocode(lat, lng) {
	if (lat == null || lng == null) return null;
	const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
	if (_reverseCache.has(key)) return _reverseCache.get(key);
	const p = (async () => {
		try {
			const r = await fetch(
				`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
				{ headers: { 'User-Agent': 'three.ws/1.0' } },
			);
			if (!r.ok) return null;
			const d = await r.json();
			return d.address?.city || d.address?.town || d.address?.village
				|| d.address?.county || d.display_name?.split(',')[0] || null;
		} catch { return null; }
	})();
	_reverseCache.set(key, p);
	return p;
}

// Forward: free-text query → up to `limit` candidate places. Returns [] on any
// failure (empty query, network, non-OK) so the caller renders a "no results"
// state rather than throwing. `signal` lets the caller abort a stale search.
export async function searchPlaces(query, { limit = 6, signal } = {}) {
	const q = String(query || '').trim();
	if (q.length < 2) return [];
	try {
		const r = await fetch(
			`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}`,
			{ headers: { 'User-Agent': 'three.ws/1.0' }, signal },
		);
		if (!r.ok) return [];
		const rows = await r.json();
		return (Array.isArray(rows) ? rows : [])
			.map((d) => ({
				lat: parseFloat(d.lat),
				lng: parseFloat(d.lon),
				label: d.display_name || '',
				short: d.display_name?.split(',').slice(0, 2).join(',') || d.display_name || '',
			}))
			.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
	} catch { return []; }
}
