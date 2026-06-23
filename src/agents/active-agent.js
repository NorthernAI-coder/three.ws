// The single canonical "my agent" — one resolved agent record shared by every
// Living-Agents surface, persisted across reloads, and broadcast on change via
// the agent bus. Defined by the Foundation task; treated as a FIXED API by
// every other feature.

import { apiFetch } from '../api.js';
import { agentBus } from './agent-bus.js';

const STORAGE_KEY = 'threews:active-agent';

let _record = null; // last resolved agent record (or null)
let _resolving = null; // in-flight resolve promise (deduped)
const _listeners = new Set();

function readStoredId() {
	try {
		return localStorage.getItem(STORAGE_KEY) || null;
	} catch {
		return null;
	}
}

function writeStoredId(id) {
	try {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* storage unavailable (private mode) — in-memory state still works */
	}
}

function notify() {
	for (const cb of _listeners) {
		try {
			cb(_record);
		} catch (err) {
			console.error('[active-agent] listener threw', err);
		}
	}
	agentBus.emit('agent:changed', {
		agentId: _record?.id || null,
		agent: _record,
		ts: _record?.updated_at || new Date().toISOString(),
	});
}

async function resolveById(id) {
	if (!id) return null;
	const r = await apiFetch(`/api/agents/${id}`, { credentials: 'include' });
	if (!r.ok) return null;
	const j = await r.json().catch(() => ({}));
	return j.agent || null;
}

/**
 * Resolve the active agent record. Reads the stored id, fetches it once, and
 * caches. Returns null when no agent is selected or the stored one is gone.
 */
export async function getActiveAgent({ force = false } = {}) {
	if (_record && !force) return _record;
	if (_resolving && !force) return _resolving;
	const id = readStoredId();
	if (!id) return null;
	_resolving = resolveById(id)
		.then((agent) => {
			_record = agent;
			if (!agent) writeStoredId(null); // stale id — drop it
			return agent;
		})
		.finally(() => {
			_resolving = null;
		});
	return _resolving;
}

/** Current cached record without triggering a fetch. */
export function peekActiveAgent() {
	return _record;
}

export function activeAgentId() {
	return _record?.id || readStoredId();
}

/**
 * Set the active agent by id, persist, resolve, and broadcast. Pass null to
 * clear. Returns the resolved record (or null).
 */
export async function setActiveAgent(id) {
	if (!id) {
		_record = null;
		writeStoredId(null);
		notify();
		return null;
	}
	writeStoredId(id);
	const agent = await resolveById(id);
	_record = agent;
	if (!agent) writeStoredId(null);
	notify();
	return agent;
}

/**
 * Replace the cached record in place (e.g. after an owner edits their agent) and
 * broadcast. The id must match the active agent, or this is a no-op.
 */
export function updateActiveAgent(patch) {
	if (!patch || !_record) return _record;
	if (patch.id && patch.id !== _record.id) return _record;
	_record = { ..._record, ...patch };
	notify();
	return _record;
}

/** Subscribe to active-agent changes. Returns an unsubscribe function. */
export function onActiveAgentChange(cb) {
	_listeners.add(cb);
	return () => _listeners.delete(cb);
}

// Cross-tab sync: a selection made in one tab reflects in the others.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (e) => {
		if (e.key !== STORAGE_KEY) return;
		const id = e.newValue || null;
		if (id === (_record?.id || null)) return;
		if (!id) {
			_record = null;
			notify();
		} else {
			resolveById(id).then((agent) => {
				_record = agent;
				notify();
			});
		}
	});
}
