// Shared server-side Metaplex Core agent deploy.
// ---------------------------------------------------------------------------
// Single source of truth for turning an agent into its on-chain identity — a
// Metaplex Core asset minted into the three.ws Agent Collection. Used by both:
//   • api/admin/bulk-launch.js  — the live SSE dashboard,
//   • scripts/deploy-agents-onchain.mjs — the CLI batch/canary runner.
//
// Custody model: one funded wallet (the collection authority) is the mint fee
// payer and — on first run — deploys the Collection account. Each agent is
// owned by its own custodial Solana wallet (generated on demand); the owner does
// NOT sign the mint, so agent wallets never need SOL.

import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, create, createCollection, ruleSet } from '@metaplex-foundation/mpl-core';
import {
	generateSigner,
	publicKey as umiPublicKey,
	createSignerFromKeypair,
	signerIdentity,
} from '@metaplex-foundation/umi';
import { sql } from './db.js';
import { env } from './env.js';
import { putObject, publicUrl as r2PublicUrl } from './r2.js';
import {
	buildAgentManifest,
	buildAgentOnchainAttributes,
	agentRoyaltyConfig,
	agentHomeUrl,
} from './three-brand.js';
import { getAgentCollection } from './solana-collection.js';
import { solanaRpcEndpoints } from './solana/connection.js';
import { generateSolanaAgentWallet } from './agent-wallet.js';
import { publishFeedEvent } from './feed.js';

// Genesis-hash chain refs (CAIP-2), mirroring api/agents/onchain/[action].js.
export const SOLANA_REFS = {
	mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
	devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

// A Core asset minted into a collection costs ~0.0037 SOL rent + fee; deploying
// the Collection account on first run costs ~0.003 SOL rent + fee.
export const EST_MINT_LAMPORTS = Math.floor(0.004 * LAMPORTS_PER_SOL);
export const EST_COLLECTION_LAMPORTS = Math.floor(0.005 * LAMPORTS_PER_SOL);

export function explorerUrl(asset, network) {
	const suffix = network === 'devnet' ? '?cluster=devnet' : '';
	return `https://solscan.io/account/${asset}${suffix}`;
}

/** Resolve the funded authority secret (collection authority == mint fee payer). */
export function authoritySecret() {
	return process.env.SOLANA_AGENT_COLLECTION_AUTHORITY_KEY || process.env.LAUNCH_FUNDER_SECRET || null;
}

/** Build a Umi instance whose identity (payer) + signer is the funded authority. */
export function buildAuthorityUmi(network, secret = authoritySecret()) {
	if (!secret) {
		throw new Error('Set SOLANA_AGENT_COLLECTION_AUTHORITY_KEY (or LAUNCH_FUNDER_SECRET) to the funded authority wallet secret.');
	}
	let authorityKeypair;
	try {
		authorityKeypair = Keypair.fromSecretKey(bs58.decode(secret));
	} catch {
		throw new Error('authority/funder secret is not a valid base58 keypair');
	}
	const umi = createUmi(solanaRpcEndpoints(network)[0]).use(mplCore());
	const authoritySigner = createSignerFromKeypair(
		umi,
		umi.eddsa.createKeypairFromSecretKey(authorityKeypair.secretKey),
	);
	umi.use(signerIdentity(authoritySigner));
	return { umi, authoritySigner, authorityKeypair };
}

/** Current authority/funder balance, in lamports (0 on RPC error). */
export async function funderLamports(umi, pubkey) {
	try {
		const bal = await umi.rpc.getBalance(pubkey);
		return Number(bal.basisPoints);
	} catch {
		return 0;
	}
}

// Pin the manifest. Try web3.storage for true IPFS pinning; otherwise fall back
// to R2 while computing the real CIDv1 (raw codec, sha2-256) from the bytes, so
// the content is verifiable content-addressing and the returned HTTPS URL is
// real and resolvable — never a stub. Mirrors api/agents/onchain/[action].js.
export async function pinManifest(manifest, agentId) {
	const bytes = Buffer.from(JSON.stringify(manifest), 'utf-8');
	const token = process.env.WEB3_STORAGE_TOKEN;
	if (token) {
		try {
			const r = await fetch('https://api.web3.storage/upload', {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
				body: bytes,
			});
			if (r.ok) {
				const data = await r.json();
				if (data.cid) return { cid: data.cid, uri: `ipfs://${data.cid}` };
			}
		} catch {
			/* fall through to R2 */
		}
	}
	const digest = await sha256.digest(bytes);
	const cid = CID.create(1, raw.code, digest).toString();
	const key = `agent-manifests/bulk/${agentId}.json`;
	await putObject({ key, body: bytes, contentType: 'application/json' });
	return { cid, uri: r2PublicUrl(key) };
}

/** Agents still missing an on-chain identity on this network. */
export async function fetchUndeployedAgents(network, limit) {
	return network === 'mainnet'
		? sql`
			SELECT ai.id, ai.user_id, ai.name, ai.description, ai.meta, ai.avatar_id,
			       av.thumbnail_key, av.storage_key
			FROM agent_identities ai
			LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
			WHERE ai.deleted_at IS NULL
			  AND ai.meta->>'sol_mint_address' IS NULL
			ORDER BY ai.created_at ASC
			LIMIT ${limit}
		`
		: sql`
			SELECT ai.id, ai.user_id, ai.name, ai.description, ai.meta, ai.avatar_id,
			       av.thumbnail_key, av.storage_key
			FROM agent_identities ai
			LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
			WHERE ai.deleted_at IS NULL
			  AND ai.meta->'devnet'->>'sol_mint_address' IS NULL
			ORDER BY ai.created_at ASC
			LIMIT ${limit}
		`;
}

// Resolve the three.ws Agent Collection for this network: prefer the env var
// (keeps the interactive deploy + edit paths aligned), then a persisted setting,
// then deploy the Collection account on first run and persist its address.
// `onEvent(type, data)` receives a 'collection' event; pass a logger or SSE emitter.
export async function resolveAgentCollection({ umi, authoritySigner, network, onEvent }) {
	const authority = authoritySigner.publicKey.toString();

	const envAddr = getAgentCollection(network);
	if (envAddr) {
		onEvent?.('collection', { address: envAddr, source: 'env', authority });
		return envAddr;
	}

	await sql`
		CREATE TABLE IF NOT EXISTS app_settings (
			key text PRIMARY KEY,
			value jsonb NOT NULL,
			updated_at timestamptz NOT NULL DEFAULT now()
		)
	`;
	const settingKey = `solana_agent_collection_${network}`;
	const [row] = await sql`SELECT value FROM app_settings WHERE key = ${settingKey}`;
	if (row?.value?.address) {
		onEvent?.('collection', { address: row.value.address, source: 'db', authority });
		return row.value.address;
	}

	// First run for this network: deploy the Collection account, funded +
	// authority-signed by the funder.
	const bal = await funderLamports(umi, authoritySigner.publicKey);
	if (bal < EST_COLLECTION_LAMPORTS) {
		throw new Error(
			`funder needs ~${(EST_COLLECTION_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL to deploy the three.ws Agents collection — top up ${authority} and re-run`,
		);
	}
	const collectionSigner = generateSigner(umi);
	const collectionUri = `${env.APP_ORIGIN}/api/agents/solana-collection-metadata?network=${network}`;
	const result = await createCollection(umi, {
		collection: collectionSigner,
		name: 'three.ws Agents',
		uri: collectionUri,
		plugins: [
			{
				type: 'Attributes',
				attributeList: [
					{ key: 'platform', value: 'three.ws' },
					{ key: 'url', value: env.APP_ORIGIN },
					{ key: 'standard', value: 'metaplex-core' },
					{ key: 'schema', value: 'agent-manifest/0.1' },
					{ key: 'chain', value: `solana:${SOLANA_REFS[network]}` },
				],
			},
		],
	}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

	const address = collectionSigner.publicKey.toString();
	const signature = bs58.encode(result.signature);
	await sql`
		INSERT INTO app_settings (key, value)
		VALUES (${settingKey}, ${JSON.stringify({ address, authority, signature, deployed_at: new Date().toISOString() })}::jsonb)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
	`;
	onEvent?.('collection', { address, source: 'deployed', authority, signature });
	return address;
}

/**
 * Deploy a single agent on-chain: ensure its owner wallet, pin its manifest,
 * mint the Core asset into the collection, and persist the result. Returns
 * { asset, signature, metadataUri, ownerAddress, image }. Pure of UI concerns —
 * pass `onEvent` to receive a 'wallet' event when a custodial wallet is created.
 */
export async function deployAgentOnce({ umi, authoritySigner, collectionAddr, collectionPk, agent, network, onEvent }) {
	const agentName = agent.name || 'Agent';

	// 1. Owner = the agent's own custodial Solana wallet (generate if missing).
	let meta = { ...(agent.meta || {}) };
	let ownerAddress = meta.solana_address;
	if (!ownerAddress) {
		const wallet = await generateSolanaAgentWallet();
		meta = {
			...meta,
			solana_address: wallet.address,
			encrypted_solana_secret: wallet.encrypted_secret,
			solana_wallet_source: 'bulk_onchain',
		};
		ownerAddress = wallet.address;
		await sql`
			UPDATE agent_identities
			SET meta = ${JSON.stringify(meta)}::jsonb, updated_at = NOW()
			WHERE id = ${agent.id}
		`;
		onEvent?.('wallet', { agent_id: agent.id, name: agentName, owner: ownerAddress });
	}

	// 2. Media + manifest.
	const image = agent.thumbnail_key ? r2PublicUrl(agent.thumbnail_key) : '';
	const animationUrl = agent.storage_key ? r2PublicUrl(agent.storage_key) : '';
	const createdAt = new Date().toISOString();
	const manifest = buildAgentManifest({
		name: agentName,
		description: agent.description || '',
		avatarId: agent.avatar_id || null,
		image,
		animationUrl,
		externalUrl: agentHomeUrl(agent.id),
		ownerAddress,
		createdAt,
	});
	const { uri: metadataUri } = await pinManifest(manifest, agent.id);

	// 3. Mint the Core asset into the collection.
	const attributes = buildAgentOnchainAttributes({
		name: agentName,
		agentUrl: agentHomeUrl(agent.id),
		createdAt,
	});
	const royalty = agentRoyaltyConfig(ownerAddress);
	const ownerPk = umiPublicKey(ownerAddress);
	const assetSigner = generateSigner(umi);
	const createArgs = {
		asset: assetSigner,
		owner: ownerPk,
		name: agentName.slice(0, 32) || 'Agent',
		uri: metadataUri,
		plugins: [
			...(attributes.length ? [{ type: 'Attributes', attributeList: attributes }] : []),
			...(royalty
				? [{
						type: 'Royalties',
						basisPoints: royalty.basisPoints,
						creators: royalty.creators.map((c) => ({ address: umiPublicKey(c.address), percentage: c.percentage })),
						ruleSet: ruleSet('None'),
					}]
				: []),
		],
	};
	if (collectionPk) {
		createArgs.collection = collectionPk;
		createArgs.authority = authoritySigner;
	}
	const result = await create(umi, createArgs).sendAndConfirm(umi, {
		confirm: { commitment: 'confirmed' },
	});
	const asset = assetSigner.publicKey.toString();
	const signature = bs58.encode(result.signature);

	// 4. Persist. Mainnet writes the canonical fields every read path keys on;
	//    devnet is isolated under meta.devnet so it never blocks a mainnet mint.
	const onchain = {
		chain: `solana:${SOLANA_REFS[network]}`,
		family: 'solana',
		cluster: network,
		onchain_id: asset,
		sol_asset: asset,
		contract_or_mint: asset,
		metadata_uri: metadataUri,
		owner: ownerAddress,
		custody: true,
		tx_hash: signature,
		...(collectionAddr ? { collection: collectionAddr } : {}),
		confirmed_at: new Date().toISOString(),
	};
	const merged =
		network === 'mainnet'
			? {
					...meta,
					chain_type: 'solana',
					network,
					sol_mint_address: asset,
					...(collectionAddr ? { collection: collectionAddr, update_authority: 'threews' } : {}),
					onchain,
				}
			: { ...meta, devnet: { sol_mint_address: asset, collection: collectionAddr || null, onchain } };

	await sql`
		UPDATE agent_identities
		SET meta = ${JSON.stringify(merged)}::jsonb, updated_at = NOW()
		WHERE id = ${agent.id}
	`;

	await sql`
		INSERT INTO agent_actions (agent_id, type, payload, source_skill)
		VALUES (
			${agent.id},
			${'solana.deploy'},
			${JSON.stringify({ asset, network, signature, collection: collectionAddr || null, owner: ownerAddress, source: 'bulk_onchain' })}::jsonb,
			${'bulk_onchain'}
		)
	`.catch(() => {});

	// Truthful on-chain feed event — fired only after the tx confirms (mainnet).
	if (network === 'mainnet') {
		publishFeedEvent({
			type: 'agent-onchain',
			ts: Date.now(),
			actor: agentName,
			agentId: agent.id,
			name: agentName,
			chain: 'Solana',
		}).catch(() => {});
	}

	return { asset, signature, metadataUri, ownerAddress, image };
}
