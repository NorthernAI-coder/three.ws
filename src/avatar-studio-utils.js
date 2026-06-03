/**
 * Pure utility helpers for the Avatar Studio — no DOM, no Three.js, no side
 * effects. Exported so they can be unit-tested in isolation.
 */

export const DRAFT_KEY = 'avatar-studio-draft';
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Collapse a working appearance to only non-empty fields. Returns null if nothing set. */
export function collapseAppearance(a) {
	if (!a) return null;
	const out = {};
	if (a.accessories?.length) out.accessories = [...a.accessories];
	if (a.morphs && Object.keys(a.morphs).length) out.morphs = { ...a.morphs };
	if (a.colors && Object.keys(a.colors).length) out.colors = { ...a.colors };
	if (a.hidden?.length) out.hidden = [...a.hidden];
	return Object.keys(out).length ? out : null;
}

/** Hydrate a saved appearance record into a mutable working object. */
export function hydrateAppearance(raw) {
	if (!raw || typeof raw !== 'object') {
		return { accessories: [], morphs: {}, colors: {}, hidden: [] };
	}
	return {
		accessories: Array.isArray(raw.accessories) ? [...raw.accessories] : [],
		morphs: raw.morphs && typeof raw.morphs === 'object' ? { ...raw.morphs } : {},
		colors: raw.colors && typeof raw.colors === 'object' ? { ...raw.colors } : {},
		hidden: Array.isArray(raw.hidden) ? [...raw.hidden] : [],
	};
}

/** Deep clone a working appearance. */
export function cloneAppearance(a) {
	return {
		accessories: [...a.accessories],
		morphs: { ...a.morphs },
		colors: { ...a.colors },
		hidden: [...a.hidden],
	};
}

/** True when two appearances are semantically identical. */
export function appearanceEqual(a, b) {
	return JSON.stringify(collapseAppearance(a)) === JSON.stringify(collapseAppearance(b));
}

/** Parse the edit avatar ID from a URLSearchParams (or query string). */
export function parseEditId(searchOrParams) {
	const p = typeof searchOrParams === 'string'
		? new URLSearchParams(searchOrParams)
		: searchOrParams;
	const v = p.get('edit');
	return v && v.trim() ? v.trim() : null;
}

/** Read a persisted draft from a storage-like object (localStorage interface). */
export function readDraft(storage) {
	try {
		const raw = storage.getItem(DRAFT_KEY);
		if (!raw) return null;
		const draft = JSON.parse(raw);
		if (!draft?.ts) return null;
		if (Date.now() - draft.ts > DRAFT_MAX_AGE_MS) {
			storage.removeItem(DRAFT_KEY);
			return null;
		}
		return draft;
	} catch {
		return null;
	}
}

/** Write a draft to storage. */
export function writeDraft(storage, appearance, name) {
	try {
		storage.setItem(DRAFT_KEY, JSON.stringify({ appearance, name, ts: Date.now() }));
	} catch {}
}

/** Remove a draft from storage. */
export function clearDraft(storage) {
	try { storage.removeItem(DRAFT_KEY); } catch {}
}
