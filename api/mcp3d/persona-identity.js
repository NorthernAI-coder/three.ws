// Persona identity resolve — the live chain-state feed behind the embodiment
// embed's visual binding (prompt 17: "the avatar IS the wallet").
//
//   GET /api/mcp3d/persona-identity?id=persona_xxx[&network=mainnet|devnet]
//     → { address, network, balances, reputation, holdings, nameplate, visual }
//
// pages/embodiment/embed.html polls this (only when opened with ?wallet=1) so
// the body's aura/cosmetic/muted-state/nameplate track LIVE chain state, not a
// snapshot frozen at the MCP tool call that minted the embed URL. Same core
// read the `persona_identity` MCP tool uses (api/_lib/persona-wallet.js) — one
// source of truth, two front doors. Read-only, no private key ever touches
// this path: getPersonaIdentity only ever derives the PUBLIC key.
//
// CORS open + short CDN cache: the embed is framed cross-origin, and a fresh
// read every ~20s (the embed's poll interval) is honest without hammering the
// RPC/attestation/Bonfida upstreams on every viewer.

import { cors, json, wrap } from '../_lib/http.js';
import { isPersonaId, getPersona, personaPublicView } from '../_lib/persona-store.js';
import { getPersonaIdentity } from '../_lib/persona-wallet.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,OPTIONS', origins: '*' })) return;

	if (req.method !== 'GET' && req.method !== 'HEAD') {
		json(res, 405, { error: 'method_not_allowed', message: 'GET this endpoint with ?id=persona_…' }, { allow: 'GET, HEAD, OPTIONS' });
		return;
	}

	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	const id = url.searchParams.get('id') || '';
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';

	if (!isPersonaId(id)) {
		json(res, 400, { error: 'invalid_id', message: 'Provide a valid persona id (?id=persona_…).' });
		return;
	}

	let record;
	try {
		record = await getPersona(id);
	} catch {
		json(res, 503, { error: 'unavailable', message: 'Could not load that persona right now. Please try again.' });
		return;
	}
	if (!record) {
		json(res, 404, { error: 'not_found', message: 'No persona found for that id.' });
		return;
	}

	let identity;
	try {
		identity = await getPersonaIdentity(id, { network });
	} catch {
		// Every sub-read inside getPersonaIdentity already degrades independently
		// — reaching here means the derivation itself failed (e.g. no
		// PERSONA_WALLET_SECRET configured). Report that honestly, not a 500.
		json(res, 503, { error: 'wallet_unavailable', message: 'This persona wallet is not available right now.' });
		return;
	}

	res.setHeader('cache-control', 'public, s-maxage=15, stale-while-revalidate=60');
	res.setHeader('cross-origin-resource-policy', 'cross-origin');
	json(res, 200, { persona: personaPublicView(record), ...identity });
});
