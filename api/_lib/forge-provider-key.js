// BYOK key resolution for the geometry generation providers (Meshy / Tripo) —
// shared by the /api/forge endpoint and the 3D Studio MCP server (/api/mcp-3d).
//
// No platform key exists for these backends, so the key must come from the
// caller. Two real sources, in priority order:
//   1. An inline key on the request — header `x-forge-provider-key` (preferred,
//      kept out of URLs/logs) or `provider_key` in the POST body. Used
//      transiently and never persisted.
//   2. The signed-in user's stored, encrypted key (the dashboard BYOK store),
//      when the request carries a session cookie.
// Returns the plaintext key or null when none is available.

import { getSessionUser } from './auth.js';
import { sql } from './db.js';
import { loadUserProviderKeys } from './provider-keys.js';

export async function resolveProviderKey(req, body, providerName) {
	const header = req.headers['x-forge-provider-key'];
	const inline =
		(typeof header === 'string' && header) ||
		(Array.isArray(header) && header[0]) ||
		(typeof body?.provider_key === 'string' ? body.provider_key : '');
	if (inline && inline.trim()) return inline.trim();

	try {
		const session = await getSessionUser(req);
		if (session?.id) {
			const [row] = await sql`SELECT provider_keys FROM users WHERE id = ${session.id}`;
			const keys = await loadUserProviderKeys(row?.provider_keys);
			if (keys[providerName]) return keys[providerName];
		}
	} catch {
		// No DB / no session — fall through to "no key".
	}
	return null;
}
