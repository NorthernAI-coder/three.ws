// agora-citizens — the roster: profession bitmap + who lives in the world.
//
// Professions are AgenC u64 capability bits (the labor market's type system).
// This map MUST stay in sync with docs/agora.md and the PROFESSIONS array in
// api/agora/[action].js. Open registry — add a bit + a real backing skill, never
// a hardcoded allowlist.
//
// Citizens are seeded from REAL platform agents (agent_identities) where
// possible, so the world is populated by the same agents users built. When too
// few real agents exist to reach the floor, we fill with standalone agent
// citizens (still real on-chain AgenC agents — they register, work, and earn;
// they just aren't linked to a user's agent record). We NEVER invent a human
// citizen here (humans join via wallet-auth in Task 08).

// Profession bit map — keep in lockstep with api/agora/[action].js PROFESSIONS.
export const PROFESSIONS = [
	{ bit: 0, key: 'fetcher', label: 'Fetcher', skill: 'x402 service call' },
	{ bit: 1, key: 'sculptor', label: 'Sculptor', skill: 'text/image → rigged GLB (forge)' },
	{ bit: 2, key: 'scribe', label: 'Scribe', skill: 'research / write (brain)' },
	{ bit: 3, key: 'cartographer', label: 'Cartographer', skill: '3D scene / diorama' },
	{ bit: 4, key: 'crier', label: 'Crier', skill: 'TTS / voice / audio2face' },
	{ bit: 5, key: 'appraiser', label: 'Appraiser', skill: 'token / market intel' },
	{ bit: 6, key: 'verifier', label: 'Verifier', skill: 're-derive proofHash + attest' },
	{ bit: 7, key: 'namekeeper', label: 'Namekeeper', skill: '.sol / ENS resolve' },
];

const PROF_BY_KEY = new Map(PROFESSIONS.map((p) => [p.key, p]));

/** OR the bits for a set of profession keys into a u64 BigInt. */
export function professionBits(keys) {
	let bits = 0n;
	for (const k of keys) {
		const p = PROF_BY_KEY.get(k);
		if (p) bits |= 1n << BigInt(p.bit);
	}
	return bits;
}

/** The primary (lowest-bit) profession key for a capability bitmap. */
export function primaryProfession(bits) {
	const b = typeof bits === 'bigint' ? bits : BigInt(bits || 0);
	for (const p of PROFESSIONS) {
		if ((b & (1n << BigInt(p.bit))) !== 0n) return p.key;
	}
	return null;
}

/** Does `caps` satisfy a task's `required` capability bitmap (required ⊆ caps)? */
export function capabilitiesSatisfy(caps, required) {
	const c = typeof caps === 'bigint' ? caps : BigInt(caps || 0);
	const r = typeof required === 'bigint' ? required : BigInt(required || 0);
	return (r & ~c) === 0n;
}

export function slug(s) {
	return String(s || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

// Named home districts in the City. Citizens spawn and idle around their home;
// world coords (x, z) on the City substrate. Spread so the world reads legibly.
const DISTRICTS = [
	{ name: 'The Commons', x: 0, z: 0 },
	{ name: 'Bazaar Row', x: 18, z: -6 },
	{ name: 'Forge Quarter', x: -16, z: 10 },
	{ name: 'Scriptorium', x: 8, z: 20 },
	{ name: 'Wharf', x: -22, z: -14 },
	{ name: 'Beacon Hill', x: 24, z: 16 },
];

function districtFor(i) {
	return DISTRICTS[i % DISTRICTS.length];
}

// Standalone citizens — the founding workforce. Task 04 expands the roster from
// one profession to the full craft: each citizen works a SPECIALTY (its primary
// profession, first in the list — Sculptor forges GLBs, Scribe writes, etc.) and
// also carries the Fetcher bit, so it satisfies the devnet dispatcher's task gate
// and never idles for lack of work. A few also carry the Verifier bit for the
// trust loop. Each becomes a real AgenC agent on devnet; names are evocative,
// not branded; no coin references. Bits are additive — see roster PROFESSIONS.
const STANDALONE = [
	{ key: 'aria-sculpt', displayName: 'Aria', professions: ['sculptor', 'fetcher', 'verifier'] },
	{ key: 'sol-scribe', displayName: 'Sol', professions: ['scribe', 'fetcher'] },
	{ key: 'cato-carto', displayName: 'Cato', professions: ['cartographer', 'fetcher'] },
	{ key: 'echo-crier', displayName: 'Echo', professions: ['crier', 'fetcher'] },
	{ key: 'mira-appraise', displayName: 'Mira', professions: ['appraiser', 'fetcher'] },
	{ key: 'nyx-name', displayName: 'Nyx', professions: ['namekeeper', 'fetcher'] },
	{ key: 'koa-fetch', displayName: 'Koa', professions: ['fetcher'] },
	{ key: 'wren-fetch', displayName: 'Wren', professions: ['fetcher', 'verifier'] },
];

function shapeStandalone(def, i) {
	const home = districtFor(i);
	return {
		key: def.key,
		kind: 'agent',
		displayName: def.displayName,
		profession: def.professions[0],
		professionBits: professionBits(def.professions),
		home,
		agentDbId: null,
		avatarUrl: null,
		// Standalone citizens derive their canonical AgenC id from a stable handle.
		identityRef: { handle: `agora-${def.key}` },
		identityHint: `standalone:${def.key}`,
	};
}

// Shape a real platform agent (agent_identities row) into a citizen spec. Its
// canonical AgenC id is derived from whatever identity proofs it carries
// (composite > erc8004 > mpl-core > handle) via the identity bridge.
function shapeSeeded(agent, i) {
	const home = districtFor(i);
	const handle = slug(agent.name) || `agent-${String(agent.id).slice(0, 8)}`;
	const ref = { handle };
	if (agent.erc8004_agent_id != null) ref.erc8004AgentId = String(agent.erc8004_agent_id);
	const mpl = agent.meta?.onchain?.solana?.asset || agent.meta?.onchain?.mplCoreAsset || agent.meta?.mplCoreAsset;
	if (mpl) ref.mplCoreAsset = String(mpl);
	return {
		key: `agent-${slug(agent.name) || String(agent.id).slice(0, 8)}`,
		kind: 'agent',
		displayName: agent.name,
		profession: 'fetcher',
		// Every seeded citizen can at least Fetch (the one profession shipped in
		// Task 02). Later tasks widen this from the agent's real skills.
		professionBits: professionBits(['fetcher']),
		home,
		agentDbId: agent.id,
		avatarUrl: agent.avatar_url || agent.profile_image_url || null,
		identityRef: ref,
		identityHint: `agent:${agent.id}`,
	};
}

/**
 * Assemble the fleet: prefer real platform agents, fill to the floor with
 * standalone citizens, cap at maxCitizens. `seededAgents` is the rows returned
 * by store.listSeedAgents() (may be empty). Returns citizen specs the engine
 * registers + runs.
 */
export function buildRoster(seededAgents, cfg) {
	const specs = [];
	const seen = new Set();

	for (let i = 0; i < (seededAgents || []).length && specs.length < cfg.maxCitizens; i++) {
		const spec = shapeSeeded(seededAgents[i], specs.length);
		if (seen.has(spec.key)) continue;
		seen.add(spec.key);
		specs.push(spec);
	}

	// Fill to the floor (and up to the cap) with standalone citizens so the world
	// is never empty even on a fresh DB with no agents.
	for (let i = 0; specs.length < cfg.maxCitizens && i < STANDALONE.length; i++) {
		const spec = shapeStandalone(STANDALONE[i], specs.length);
		if (seen.has(spec.key)) continue;
		seen.add(spec.key);
		specs.push(spec);
	}

	return specs.slice(0, cfg.maxCitizens);
}
