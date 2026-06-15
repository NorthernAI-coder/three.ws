#!/usr/bin/env node
/**
 * Register three.ws ITSELF as an on-chain agent on Solana.
 * ------------------------------------------------------------------------------
 * three.ws tells users to register their agents on-chain; this registers the
 * platform's own identity, eating our own dog food. The agent is minted as a
 * Metaplex Core asset inside the "three.ws Agents" collection — exactly the flow
 * api/_lib/onchain-deploy.js runs for user agents — and (best-effort) enrolled in
 * the Metaplex Agent Registry. The result is written back into the public
 * discovery documents so any agent/indexer that reads three.ws can verify it.
 *
 * This is self-contained (no DB, no api/_lib/env.js coupling) so it runs from a
 * CLI with only a funded authority key — mirroring scripts/batch-mint-agents.mjs.
 *
 * Source of truth for the agent's identity is the committed card:
 *   public/.well-known/3d-agent-card.json   (name, description, model, services)
 * The model bytes are verified against model.sha256 before anything is minted
 * (three.ws Card v1 conformance point 3) — a mismatch aborts the run.
 *
 * Usage:
 *   # devnet dry-run of the whole flow (no tx sent)
 *   node scripts/register-three-ws-agent-solana.mjs --network devnet --dry-run
 *
 *   # real devnet registration (authority must hold a little devnet SOL)
 *   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY=<bs58> \
 *     node scripts/register-three-ws-agent-solana.mjs --network devnet
 *
 *   # real mainnet registration (authority must hold ~0.02 SOL; irreversible)
 *   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY=<bs58> SOLANA_RPC_URL=<rpc> \
 *   CONFIRM_MAINNET=yes \
 *     node scripts/register-three-ws-agent-solana.mjs --network mainnet
 *
 * Authority resolution (first that parses):
 *   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY → LAUNCH_FUNDER_SECRET → .keys/authority-3WS.json
 * Collection resolution:
 *   SOLANA_AGENT_COLLECTION_<NET> env → ledger → deploy with .keys/collection-3ws.json
 *
 * Re-running is safe: once the asset for a network is in the ledger and exists
 * on-chain, the mint is skipped and only the discovery docs are reconciled.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { CID } from 'multiformats/cid';
import * as rawCodec from 'multiformats/codecs/raw';
import { sha256 as mfSha256 } from 'multiformats/hashes/sha2';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
	mplCore,
	create,
	createCollection,
	fetchCollection,
	ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
	generateSigner,
	publicKey as umiPublicKey,
	createSignerFromKeypair,
	signerIdentity,
} from '@metaplex-foundation/umi';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Canonical brand (mirrors api/_lib/three-brand.js — the single source) ──────
const THREE_WS = {
	name: 'three.ws',
	tagline: 'Give your AI a body.',
	website: 'https://three.ws',
	x: 'https://x.com/trythreews',
	github: 'https://github.com/nirholas/three.ws',
	ogImage: 'https://three.ws/og-image.png',
};
// $THREE — the only coin this platform references.
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

// CAIP-2 genesis-hash chain refs.
const SOLANA_REFS = {
	mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
	devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

const CARD_PATH = resolve(REPO_ROOT, 'public/.well-known/3d-agent-card.json');
const REG_PATH = resolve(REPO_ROOT, 'public/.well-known/agent-registration.json');
const LEDGER_PATH = resolve(REPO_ROOT, 'data/three-ws-agent-onchain.json');
const MANIFEST_PUBLIC_PATH = resolve(REPO_ROOT, 'public/.well-known/three-ws-agent.metaplex.json');
const MANIFEST_PUBLIC_URL = `${THREE_WS.website}/.well-known/three-ws-agent.metaplex.json`;

// Cost estimates (rent + fee): collection deploy ~0.005, mint ~0.004, registry
// ~0.003. Add buffer; refuse to attempt with less so we never half-finish.
const NEED_LAMPORTS = Math.floor(0.02 * LAMPORTS_PER_SOL);

// ── args / env ────────────────────────────────────────────────────────────────

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
		? process.argv[i + 1]
		: fallback;
}
function flag(name) {
	return process.argv.includes(name);
}

function loadDotEnv() {
	// Best-effort, like the other scripts: pick up .env / .vercel preview without
	// making dotenv a hard dep. Never overrides an already-set process env var.
	for (const p of [resolve(REPO_ROOT, '.env'), resolve(REPO_ROOT, '.env.local')]) {
		if (!existsSync(p)) continue;
		for (const raw of readFileSync(p, 'utf8').split('\n')) {
			const line = raw.trim();
			if (!line || line.startsWith('#')) continue;
			const eq = line.indexOf('=');
			if (eq < 0) continue;
			const k = line.slice(0, eq).trim();
			let v = line.slice(eq + 1).trim();
			if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
				v = v.slice(1, -1);
			}
			if (process.env[k] === undefined && v) process.env[k] = v;
		}
	}
}

// Parse a secret in any of the formats we store keys in (bs58, base64, json array).
function parseKeypair(value) {
	if (!value) return null;
	const v = value.trim();
	try {
		if (v.startsWith('[')) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(v)));
	} catch {
		/* not json */
	}
	try {
		const b = bs58.decode(v);
		if (b.length === 64) return Keypair.fromSecretKey(b);
		if (b.length === 32) return Keypair.fromSeed(b);
	} catch {
		/* not bs58 */
	}
	try {
		const b = Buffer.from(v, 'base64');
		if (b.length === 64) return Keypair.fromSecretKey(new Uint8Array(b));
	} catch {
		/* not base64 */
	}
	return null;
}

function loadKeypairFile(rel) {
	const p = resolve(REPO_ROOT, rel);
	if (!existsSync(p)) return null;
	try {
		return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
	} catch {
		return null;
	}
}

function resolveAuthority() {
	for (const env of ['SOLANA_AGENT_COLLECTION_AUTHORITY_KEY', 'LAUNCH_FUNDER_SECRET']) {
		const kp = parseKeypair(process.env[env]);
		if (kp) return { kp, source: env };
	}
	const file = loadKeypairFile('.keys/authority-3WS.json');
	if (file) return { kp: file, source: '.keys/authority-3WS.json' };
	return { kp: null, source: null };
}

function rpcEndpoint(network) {
	const key = process.env.HELIUS_API_KEY;
	const alch = process.env.ALCHEMY_API_KEY;
	if (network === 'devnet') {
		return (
			process.env.SOLANA_RPC_URL_DEVNET ||
			(key && `https://devnet.helius-rpc.com/?api-key=${key}`) ||
			(alch && `https://solana-devnet.g.alchemy.com/v2/${alch}`) ||
			'https://api.devnet.solana.com'
		);
	}
	return (
		process.env.SOLANA_RPC_URL ||
		process.env.SOLANA_MAINNET_RPC ||
		(key && `https://mainnet.helius-rpc.com/?api-key=${key}`) ||
		(alch && `https://solana-mainnet.g.alchemy.com/v2/${alch}`) ||
		'https://api.mainnet-beta.solana.com'
	);
}

// ── ledger / discovery-doc IO ───────────────────────────────────────────────────

function readJson(path, fallback) {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return fallback;
	}
}

function writeJsonTabs(path, obj) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, '\t') + '\n');
}

function loadLedger() {
	return readJson(LEDGER_PATH, { agent: 'three.ws', networks: {} });
}

// ── IPFS pinning (mirrors api/_lib/ipfs-pin.js) ─────────────────────────────────

async function pinToIPFS(buf, filename) {
	if (process.env.PINATA_JWT) {
		const form = new FormData();
		form.append('file', new Blob([buf]), filename);
		const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
			method: 'POST',
			headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
			body: form,
		});
		if (!resp.ok) throw new Error(`Pinata error ${resp.status}: ${await resp.text().catch(() => '')}`);
		const data = await resp.json();
		return { cid: data.IpfsHash, uri: `https://ipfs.io/ipfs/${data.IpfsHash}`, provider: 'pinata' };
	}
	if (process.env.WEB3_STORAGE_TOKEN) {
		const resp = await fetch('https://api.web3.storage/upload', {
			method: 'POST',
			headers: { Authorization: `Bearer ${process.env.WEB3_STORAGE_TOKEN}`, 'X-NAME': filename },
			body: buf,
		});
		if (!resp.ok) throw new Error(`web3.storage error ${resp.status}`);
		const data = await resp.json();
		return { cid: data.cid, uri: `https://ipfs.io/ipfs/${data.cid}`, provider: 'web3.storage' };
	}
	return null;
}

async function cidv1(buf) {
	const digest = await mfSha256.digest(new Uint8Array(buf));
	return CID.create(1, rawCodec.code, digest).toString();
}

// ── manifest (Metaplex superset + 3D Card v1, mirrors three-brand.js) ───────────

function buildManifest(card, { glbUrl, ownerAddress }) {
	const image = card.image || THREE_WS.ogImage;
	return {
		// 3D Agent Card v1 conformance (type array w/ both URIs, model, trust)
		type: card.type,
		// Metaplex token-metadata standard
		name: card.name,
		symbol: 'AGENT',
		description: card.description,
		image,
		animation_url: glbUrl,
		external_url: THREE_WS.website,
		active: true,
		model: card.model,
		body: { uri: glbUrl, format: card.model?.format || 'gltf-binary' },
		services: card.services,
		x402Support: card.x402Support !== false,
		x402Endpoints: card.x402Endpoints || [],
		supportedTrust: card.supportedTrust || ['reputation', 'validation'],
		attributes: [
			{ trait_type: 'Platform', value: THREE_WS.name },
			{ trait_type: 'Standard', value: 'Metaplex Core' },
			{ trait_type: 'Schema', value: 'agent-manifest/0.1' },
			{ trait_type: '$THREE', value: THREE_MINT },
		],
		properties: {
			category: 'vr',
			files: [
				{ uri: image, type: 'image/png' },
				{ uri: glbUrl, type: 'model/gltf-binary' },
			],
			creators: ownerAddress ? [{ address: ownerAddress, share: 100 }] : [],
		},
		platform: {
			name: THREE_WS.name,
			url: THREE_WS.website,
			tagline: THREE_WS.tagline,
			x: THREE_WS.x,
			github: THREE_WS.github,
		},
		token: { symbol: 'THREE', mint: THREE_MINT, url: `https://pump.fun/coin/${THREE_MINT}` },
		$schema: 'https://3d-agent.io/schemas/manifest/0.1.json',
		spec: 'agent-manifest/0.1',
		tags: ['three.ws', 'ai-agent', 'platform'],
	};
}

function onchainAttributes() {
	return [
		{ key: 'platform', value: THREE_WS.name },
		{ key: 'url', value: THREE_WS.website },
		{ key: 'agent', value: THREE_WS.name },
		{ key: 'x', value: THREE_WS.x },
		{ key: 'github', value: THREE_WS.github },
		{ key: '$THREE', value: THREE_MINT },
		{ key: 'standard', value: 'metaplex-core' },
		{ key: 'schema', value: 'agent-manifest/0.1' },
	];
}

// ── discovery-doc reconciliation ────────────────────────────────────────────────

function applyOnchainToDoc(path, onchain, registration) {
	const doc = readJson(path, null);
	if (!doc) return false;
	doc.onchain = onchain;
	const regs = Array.isArray(doc.registrations) ? doc.registrations : [];
	const exists = regs.some(
		(r) => r.agentId === registration.agentId && r.agentRegistry === registration.agentRegistry,
	);
	if (!exists) regs.push(registration);
	doc.registrations = regs;
	writeJsonTabs(path, doc);
	return true;
}

// ── main ────────────────────────────────────────────────────────────────────────

async function main() {
	loadDotEnv();
	const network = arg('--network', 'devnet') === 'mainnet' ? 'mainnet' : 'devnet';
	const dryRun = flag('--dry-run');
	const ownerOverride = arg('--owner', null);

	if (network === 'mainnet' && !dryRun && process.env.CONFIRM_MAINNET !== 'yes') {
		console.error('Refusing mainnet registration without CONFIRM_MAINNET=yes (irreversible, costs real SOL).');
		process.exit(1);
	}

	// 1. Load + verify the canonical card.
	const card = readJson(CARD_PATH, null);
	if (!card || !card.model?.uri || !card.model?.sha256) {
		console.error(`Canonical card missing or malformed: ${CARD_PATH}`);
		process.exit(1);
	}
	const glbName = basename(card.model.uri);
	const glbLocal = resolve(REPO_ROOT, 'public/avatars', glbName);
	if (!existsSync(glbLocal)) {
		console.error(`Model file not found locally: ${glbLocal} (model.uri=${card.model.uri})`);
		process.exit(1);
	}
	const glbBytes = readFileSync(glbLocal);
	const actualSha = createHash('sha256').update(glbBytes).digest('hex');
	if (actualSha !== card.model.sha256) {
		console.error('Card model.sha256 does NOT match the model bytes — card is unverified per spec point 3.');
		console.error(`  expected ${card.model.sha256}`);
		console.error(`  actual   ${actualSha}`);
		process.exit(1);
	}
	console.log(`✓ model verified: ${glbName} sha256=${actualSha} (${glbBytes.length} bytes)`);

	// 2. Authority (fee payer + collection update authority).
	const { kp: authorityKp, source: authSource } = resolveAuthority();
	if (!authorityKp) {
		console.error('No authority keypair: set SOLANA_AGENT_COLLECTION_AUTHORITY_KEY or provide .keys/authority-3WS.json');
		process.exit(1);
	}
	const authorityAddr = authorityKp.publicKey.toBase58();

	// Collection signer (for first-run deploy) — vanity preferred.
	const envCollection =
		network === 'mainnet'
			? process.env.SOLANA_AGENT_COLLECTION_MAINNET
			: process.env.SOLANA_AGENT_COLLECTION_DEVNET;
	const ledger = loadLedger();
	let collectionAddr = (envCollection && envCollection.trim()) || ledger.networks?.[network]?.collection || null;
	const collectionKp = loadKeypairFile('.keys/collection-3ws.json');

	// Owner of the platform agent asset: explicit → www vanity → authority custody.
	const wwwKp = loadKeypairFile('scripts/www-vanity.json');
	const ownerAddr = ownerOverride || wwwKp?.publicKey.toBase58() || authorityAddr;

	const rpc = rpcEndpoint(network);
	console.log(`network:    ${network}`);
	console.log(`rpc:        ${rpc.replace(/api-key=[^&]+/i, 'api-key=***')}`);
	console.log(`authority:  ${authorityAddr}  (from ${authSource})`);
	console.log(`owner:      ${ownerAddr}${ownerAddr === authorityAddr ? ' (custody)' : ''}`);
	console.log(`collection: ${collectionAddr || (collectionKp ? collectionKp.publicKey.toBase58() + ' (to deploy)' : 'fresh keypair (to deploy)')}`);
	console.log(`mode:       ${dryRun ? 'DRY RUN' : 'LIVE'}`);

	// 3. Idempotency — already registered on this network?
	const existing = ledger.networks?.[network];
	if (existing?.asset && !dryRun) {
		console.log(`\nAlready registered on ${network}: asset ${existing.asset}. Reconciling discovery docs only.`);
		reconcile(network, existing);
		console.log('Done (no new mint).');
		return;
	}

	// 4. Umi + authority signer.
	const umi = createUmi(rpc).use(mplCore());
	const authoritySigner = createSignerFromKeypair(
		umi,
		umi.eddsa.createKeypairFromSecretKey(authorityKp.secretKey),
	);
	umi.use(signerIdentity(authoritySigner));

	// 5. Build + pin the manifest. GLB stays first-party (verifiable via sha256);
	//    optionally also pinned to IPFS for immutability.
	let glbUrl = card.model.uri;
	if (!dryRun) {
		const pinnedGlb = await pinToIPFS(glbBytes, glbName).catch((e) => {
			console.log(`  GLB pin skipped (${e.message}); using first-party URL`);
			return null;
		});
		if (pinnedGlb) {
			glbUrl = pinnedGlb.uri;
			console.log(`✓ GLB pinned: ${pinnedGlb.uri} (cid ${pinnedGlb.cid})`);
			// Verify pinned bytes hash to the same sha256 (spec point 3 over IPFS).
			const back = Buffer.from(await (await fetch(pinnedGlb.uri)).arrayBuffer());
			const backSha = createHash('sha256').update(back).digest('hex');
			if (backSha !== card.model.sha256) throw new Error(`pinned GLB sha256 mismatch: ${backSha}`);
			console.log('✓ pinned GLB bytes verified against model.sha256');
		}
	}

	const manifest = buildManifest(card, { glbUrl, ownerAddress: ownerAddr });
	const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf-8');
	let metadataUri;
	if (dryRun) {
		metadataUri = MANIFEST_PUBLIC_URL;
		console.log(`[dry-run] would pin manifest (${manifestBytes.length} bytes); cidv1=${await cidv1(manifestBytes)}`);
	} else {
		const pinnedManifest = await pinToIPFS(manifestBytes, 'three-ws-agent.json').catch(() => null);
		if (pinnedManifest) {
			metadataUri = pinnedManifest.uri;
			console.log(`✓ manifest pinned: ${metadataUri} (cid ${pinnedManifest.cid})`);
		} else {
			// First-party fallback — write the resolvable Metaplex metadata to public/.
			writeJsonTabs(MANIFEST_PUBLIC_PATH, manifest);
			metadataUri = MANIFEST_PUBLIC_URL;
			console.log(`✓ manifest written first-party (no IPFS provider): ${metadataUri}`);
		}
	}

	if (dryRun) {
		console.log('\n[dry-run] all inputs verified. Re-run without --dry-run (and with a funded authority) to mint.');
		return;
	}

	// 6. Funding gate — never half-finish.
	const balLamports = Number((await umi.rpc.getBalance(authoritySigner.publicKey)).basisPoints);
	console.log(`balance:    ${(balLamports / LAMPORTS_PER_SOL).toFixed(5)} SOL`);
	if (balLamports < NEED_LAMPORTS) {
		console.error(
			`\nInsufficient SOL. Fund the authority wallet, then re-run:\n` +
				`  address: ${authorityAddr}\n` +
				`  need:    ~${(NEED_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL on ${network}\n` +
				(network === 'devnet'
					? `  devnet:  solana airdrop 1 ${authorityAddr} --url ${rpc}  (or https://faucet.solana.com)\n`
					: `  mainnet: transfer ~0.02 SOL to the address above\n`),
		);
		process.exit(2);
	}

	// 7. Ensure the collection exists (deploy on first run with the vanity key).
	if (!collectionAddr) {
		const collectionSigner = collectionKp
			? createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(collectionKp.secretKey))
			: generateSigner(umi);
		const collectionUri = `${THREE_WS.website}/api/agents/solana-collection-metadata?network=${network}`;
		console.log(`Deploying collection ${collectionSigner.publicKey}…`);
		await createCollection(umi, {
			collection: collectionSigner,
			name: 'three.ws Agents',
			uri: collectionUri,
			plugins: [
				{
					type: 'Attributes',
					attributeList: [
						{ key: 'platform', value: 'three.ws' },
						{ key: 'url', value: THREE_WS.website },
						{ key: 'standard', value: 'metaplex-core' },
						{ key: 'schema', value: 'agent-manifest/0.1' },
						{ key: 'chain', value: `solana:${SOLANA_REFS[network]}` },
					],
				},
			],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		collectionAddr = collectionSigner.publicKey.toString();
		console.log(`✓ collection deployed: ${collectionAddr}`);
	}
	const collectionAsset = await fetchCollection(umi, umiPublicKey(collectionAddr));

	// 8. Mint the platform agent asset into the collection.
	const assetSigner = generateSigner(umi);
	const ownerPk = umiPublicKey(ownerAddr);
	console.log(`Minting agent asset ${assetSigner.publicKey}…`);
	const result = await create(umi, {
		asset: assetSigner,
		collection: collectionAsset,
		authority: authoritySigner,
		owner: ownerPk,
		name: card.name.slice(0, 32),
		uri: metadataUri,
		plugins: [
			{ type: 'Attributes', attributeList: onchainAttributes() },
			{
				type: 'Royalties',
				basisPoints: 500,
				creators: [{ address: ownerPk, percentage: 100 }],
				ruleSet: ruleSet('None'),
			},
		],
	}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
	const asset = assetSigner.publicKey.toString();
	const signature = bs58.encode(result.signature);
	console.log(`✓ minted: asset ${asset}  tx ${signature}`);

	// 9. Best-effort: enrol in the Metaplex Agent Registry (Agent Identity PDA).
	let identityPda = null;
	try {
		const { registerAgentIdentity } = await import('../api/_lib/agent-registry.js');
		const reg = await registerAgentIdentity({
			umi,
			authoritySigner,
			asset,
			collectionAddr,
			registrationUri: `${THREE_WS.website}/.well-known/agent-registration.json`,
		});
		identityPda = reg.identityPda;
		console.log(`✓ Agent Registry: identity PDA ${identityPda}${reg.alreadyRegistered ? ' (existing)' : ''}`);
	} catch (e) {
		console.log(`  Agent Registry enrolment skipped (${e.message}) — Core asset registration stands.`);
	}

	// 10. Persist ledger + reconcile discovery docs.
	const record = {
		asset,
		collection: collectionAddr,
		owner: ownerAddr,
		custody: ownerAddr === authorityAddr,
		authority: authorityAddr,
		metadata_uri: metadataUri,
		tx_hash: signature,
		...(identityPda ? { identity_pda: identityPda } : {}),
		confirmed_at: new Date().toISOString(),
		explorer: `https://solscan.io/account/${asset}${network === 'devnet' ? '?cluster=devnet' : ''}`,
	};
	const led = loadLedger();
	led.networks[network] = record;
	writeJsonTabs(LEDGER_PATH, led);
	console.log(`✓ ledger: ${LEDGER_PATH}`);

	reconcile(network, record);
	console.log(`\n✅ three.ws registered on Solana ${network}.`);
	console.log(`   passport: ${THREE_WS.website}/agent-passport.html?asset=${asset}&network=${network}`);
	console.log(`   explorer: ${record.explorer}`);
}

// Reconcile the two public discovery docs from a ledger record.
function reconcile(network, record) {
	const onchain = {
		family: 'solana',
		chain: `solana:${SOLANA_REFS[network]}`,
		cluster: network,
		contract_or_mint: record.asset,
		collection: record.collection,
		metadata_uri: record.metadata_uri,
		owner: record.owner,
		tx_hash: record.tx_hash,
		...(record.identity_pda ? { onchain_id: record.identity_pda } : {}),
		confirmed_at: record.confirmed_at,
	};
	const registration = {
		agentId: record.asset,
		agentRegistry: `solana:${SOLANA_REFS[network]}:${record.collection}`,
	};
	// Mainnet is the canonical identity written into the docs; devnet stays in the
	// ledger only so it never overwrites a mainnet registration in the public docs.
	if (network === 'mainnet') {
		for (const p of [CARD_PATH, REG_PATH]) {
			if (applyOnchainToDoc(p, onchain, registration)) console.log(`✓ updated ${basename(p)}`);
		}
	} else {
		console.log('  (devnet — discovery docs reserved for the mainnet identity; recorded in ledger)');
	}
}

main().catch((err) => {
	console.error('\n❌ failed:', err?.message || err);
	process.exit(1);
});
