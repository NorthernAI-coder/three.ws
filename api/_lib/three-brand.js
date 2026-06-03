/**
 * three.ws on-chain brand + metadata builders
 * -------------------------------------------
 * Single source of truth for everything we stamp onto Solana when an agent is
 * deployed (Metaplex Core asset) or tokenized (pump.fun). Two goals:
 *
 *   1. Make every on-chain artifact unmistakably a three.ws artifact — the
 *      platform name, our links, and the $THREE coin travel with the asset so a
 *      wallet, explorer, or marketplace surfaces the connection without us.
 *   2. Maximize *correct* metadata. The off-chain JSON is a strict superset of
 *      the Metaplex token-metadata standard (so Phantom / Solscan / Magic Eden
 *      render it) AND our agent-manifest/0.1 schema. The on-chain Attributes
 *      plugin writes a curated subset *directly into the asset account* — real
 *      bytes on the blockchain, not just a pointer.
 *
 * Links here are the canonical ones used across the site (footer.html,
 * features.json). Never invent a URL — if it isn't already real, it doesn't
 * belong in on-chain metadata.
 */

import { env } from './env.js';

// ── Canonical brand ──────────────────────────────────────────────────────────

export const THREE_WS = {
	name: 'three.ws',
	tagline: 'Give your AI a body.',
	description:
		'three.ws is the AI-agent layer for the open web: build, embed, monetize, ' +
		'and trade autonomous agents with real 3D avatars, on-chain identity, ' +
		'pay-per-call (x402), and pump.fun token launches.',
	website: 'https://three.ws',
	x: 'https://x.com/trythreews',
	xHandle: '@trythreews',
	github: 'https://github.com/nirholas/three.ws',
	docs: 'https://three.ws/docs',
	ogImage: 'https://three.ws/og.png',
};

// ── $THREE — the platform coin every artifact links back to ──────────────────

/** @returns {string} the $THREE mint (env-overridable for devnet/test). */
export function threeTokenMint() {
	return env.THREE_TOKEN_MINT;
}

/** Canonical $THREE link set, derived from the active mint. */
export function threeTokenLinks(mint = threeTokenMint()) {
	return {
		symbol: 'THREE',
		mint,
		pumpfun: `https://pump.fun/coin/${mint}`,
		jupiter: `https://jup.ag/tokens/${mint}`,
		solscan: `https://solscan.io/token/${mint}`,
		phantom: `https://phantom.com/tokens/solana/${mint}`,
		dexscreener: `https://dexscreener.com/solana/${mint}`,
		coingecko: 'https://www.coingecko.com/en/coins/three-ws',
	};
}

/** Public profile page for a deployed agent. */
export function agentHomeUrl(agentId) {
	return `${env.APP_ORIGIN}/agent/${agentId}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function clamp(str, max) {
	const s = String(str ?? '').trim();
	return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** A Metaplex `creators` array crediting the owner + the platform. */
function creators(ownerAddress) {
	const list = [];
	if (ownerAddress) list.push({ address: ownerAddress, share: 100 });
	return list;
}

// ── Agent identity (Metaplex Core asset) ─────────────────────────────────────

/**
 * Off-chain JSON pinned for a Metaplex Core agent asset. Superset of the
 * Metaplex token-metadata standard + agent-manifest/0.1, so generic NFT readers
 * and our own resolvers both work from one document.
 *
 * @param {object} a
 * @param {string} a.name
 * @param {string} [a.description]
 * @param {string} [a.image]            resolvable avatar thumbnail (https/ipfs)
 * @param {string} [a.animationUrl]     avatar GLB (https/ipfs)
 * @param {string} [a.externalUrl]      agent profile page
 * @param {string|null} [a.avatarId]
 * @param {string[]} [a.skills]
 * @param {string} [a.ownerAddress]     for the creators array
 * @param {string} [a.createdAt]        ISO timestamp
 */
export function buildAgentManifest(a) {
	const tok = threeTokenLinks();
	const image = a.image || THREE_WS.ogImage;
	const description =
		a.description?.trim() || `${a.name} — an autonomous agent on ${THREE_WS.name}.`;

	const attributes = [
		{ trait_type: 'Platform', value: THREE_WS.name },
		{ trait_type: 'Standard', value: 'Metaplex Core' },
		{ trait_type: 'Schema', value: 'agent-manifest/0.1' },
		...(a.skills?.length ? [{ trait_type: 'Skills', value: a.skills.join(', ') }] : []),
		{ trait_type: '$THREE', value: tok.mint },
		...(a.createdAt ? [{ trait_type: 'Created', value: a.createdAt }] : []),
	];

	const files = [{ uri: image, type: 'image/png' }];
	if (a.animationUrl) files.push({ uri: a.animationUrl, type: 'model/gltf-binary' });

	return {
		// Metaplex token-metadata standard
		name: a.name,
		symbol: 'AGENT',
		description,
		image,
		...(a.animationUrl ? { animation_url: a.animationUrl } : {}),
		external_url: a.externalUrl || THREE_WS.website,
		attributes,
		properties: {
			category: a.animationUrl ? 'vr' : 'image',
			files,
			creators: creators(a.ownerAddress),
		},
		// three.ws brand block — links travel with the asset
		platform: {
			name: THREE_WS.name,
			url: THREE_WS.website,
			tagline: THREE_WS.tagline,
			x: THREE_WS.x,
			github: THREE_WS.github,
		},
		token: { symbol: tok.symbol, mint: tok.mint, url: tok.pumpfun },
		// agent-manifest/0.1 (our resolvers)
		$schema: 'https://3d-agent.io/schemas/manifest/0.1.json',
		spec: 'agent-manifest/0.1',
		tags: ['three.ws', 'ai-agent', ...(a.skills || [])],
		body: { uri: a.animationUrl || '', format: 'gltf-binary' },
		_baseURI: 'ipfs://',
		...(a.avatarId ? { avatarId: a.avatarId } : {}),
		...(a.skills?.length ? { skills: a.skills } : {}),
	};
}

/**
 * Attributes written *directly on-chain* via the Metaplex Core Attributes
 * plugin. This is the literal "more metadata on the blockchain" — each pair is
 * stored in the asset account (and costs rent), so the set is curated: brand,
 * provenance links, the off-chain JSON pointer, and the $THREE linkage.
 *
 * Keys are short; values are clamped so a long agent name or skill list can't
 * blow up rent. Returns `[{ key, value }]` ready for the plugin's attributeList.
 */
export function buildAgentOnchainAttributes(a) {
	const tok = threeTokenLinks();
	// Caps keep the plugin well under Solana's 1232-byte tx limit even with a
	// long agent name, a long IPFS URI, and a full skill list.
	const pairs = [
		['platform', THREE_WS.name],
		['url', THREE_WS.website],
		['agent', clamp(a.name, 48)],
		...(a.agentUrl ? [['agent_url', clamp(a.agentUrl, 80)]] : []),
		['x', THREE_WS.x],
		['github', THREE_WS.github],
		['$THREE', tok.mint],
		['$THREE_url', tok.pumpfun],
		['standard', 'metaplex-core'],
		['schema', 'agent-manifest/0.1'],
		...(a.metadataUri ? [['metadata', clamp(a.metadataUri, 96)]] : []),
		...(a.skills?.length ? [['skills', clamp(a.skills.join(','), 96)]] : []),
		...(a.createdAt ? [['created', a.createdAt]] : []),
	];
	return pairs.map(([key, value]) => ({ key, value: String(value) }));
}

// ── Agent token (pump.fun) ───────────────────────────────────────────────────

/**
 * Off-chain JSON for a pump.fun token. pump.fun's UI reads name/symbol/
 * description/image/showName/createdOn/twitter/telegram/website — we fill those
 * so the coin page links back to three.ws and our X. Extra standard fields
 * (external_url, attributes, properties) are ignored by pump.fun but render in
 * wallets and explorers.
 *
 * @param {object} t
 * @param {string} t.name
 * @param {string} t.symbol
 * @param {string} [t.description]
 * @param {string} [t.image]
 * @param {string} [t.website]      defaults to the agent page (falls back to three.ws)
 * @param {string} [t.twitter]      defaults to the three.ws X account
 * @param {string} [t.telegram]
 * @param {string} [t.agentUrl]     agent profile page
 * @param {string} [t.creatorAddress]
 * @param {string} [t.createdAt]    ISO timestamp
 */
export function buildTokenMetadata(t) {
	const tok = threeTokenLinks();
	const website = t.website || t.agentUrl || THREE_WS.website;
	const twitter = t.twitter || THREE_WS.x;
	const description =
		t.description?.trim() ||
		`${t.name} — an autonomous agent token launched on ${THREE_WS.name}.`;

	const attributes = [
		{ trait_type: 'Platform', value: THREE_WS.name },
		{ trait_type: 'Launchpad', value: 'pump.fun' },
		{ trait_type: '$THREE', value: tok.mint },
	];

	const json = {
		name: t.name,
		symbol: t.symbol,
		description,
		image: t.image || '',
		showName: true,
		createdOn: THREE_WS.website,
		website,
		twitter,
		...(t.telegram ? { telegram: t.telegram } : {}),
		// Standard + brand extras (explorers/wallets read these; pump ignores them)
		external_url: website,
		attributes,
		properties: {
			category: 'image',
			...(t.image ? { files: [{ uri: t.image, type: 'image/png' }] } : {}),
			creators: creators(t.creatorAddress),
		},
		platform: {
			name: THREE_WS.name,
			url: THREE_WS.website,
			x: THREE_WS.x,
			github: THREE_WS.github,
		},
		token: { symbol: tok.symbol, mint: tok.mint, url: tok.pumpfun },
		...(t.createdAt ? { createdAt: t.createdAt } : {}),
	};
	return json;
}
