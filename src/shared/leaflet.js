/**
 * Shared lazy Leaflet loader.
 *
 * Leaflet's JS + CSS are fetched from a CDN only on first use, so surfaces that
 * never open a map (most of the app) pay nothing for it. Every map surface — the
 * dashboard placement editor and the /irl My-pins overview — shares this one
 * loader, so there is a single CDN source, a single promise cache (Leaflet loads
 * at most once per session), and a single graceful-failure contract: a blocked or
 * offline CDN rejects, and every caller degrades to a map-free fallback instead of
 * a broken surface.
 */

export const LEAFLET_JS  = 'https://esm.sh/leaflet@1.9.4';
export const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

let _cssPromise = null;
export function ensureLeafletCss() {
	if (_cssPromise) return _cssPromise;
	_cssPromise = new Promise((resolve, reject) => {
		if (typeof document === 'undefined') { reject(new Error('no document')); return; }
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
