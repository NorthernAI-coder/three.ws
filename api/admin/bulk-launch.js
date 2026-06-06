// GET /api/admin/bulk-launch — SSE stream that deploys agents on-chain as
// Metaplex Core assets inside the three.ws Agent Collection (NOT pump.fun).
//
// Each agent becomes a real Solana Metaplex Core NFT — its on-chain identity:
//   • minted into the "three.ws Agents" Collection (authority-managed by three.ws),
//   • owned by the agent's own custodial Solana wallet (so the agent holds its
//     identity and can transfer/sell it later),
//   • carrying an on-chain Attributes plugin (platform, links, $THREE) written
//     into the asset account itself, plus an enforced 5% Royalties plugin,
//   • pointing at a pinned manifest (Metaplex token-metadata + agent-manifest/0.1).
//
// One funded wallet does everything: it is the collection authority, the mint
// fee payer, and — on first run — the deployer of the Collection account. The
// agent wallets need no SOL (the owner of a Core asset does not sign the mint).
//
// Query params:
//   network   mainnet | devnet   (default: mainnet)
//   limit     max agents to process this run (default: 100, max 500)
//   dry_run   true | false        (default: false) — skips all on-chain steps
//
// SSE events:
//   init        { total, network, funder, funder_balance_sol, dry_run }
//   collection  { address, source: env|db|deployed, authority, signature? }
//   wallet      { agent_id, name, owner }
//   deployed    { agent_id, name, asset, owner, metadata_uri, signature, explorer_url, avatar_thumb }
//   skip        { agent_id, name, reason }
//   error       { agent_id, name, error }
//   paused      { funder_balance_sol, deployed, reason }
//   done        { deployed, errors, skipped }

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
import { sql } from '../_lib/db.js';
import { cors, method, error } from '../_lib/http.js';
import { requireAdmin } from '../_lib/admin.js';
import { env } from '../_lib/env.js';
import { putObject, publicUrl as r2PublicUrl } from '../_lib/r2.js';
import {
	buildAgentManifest,
	buildAgentOnchainAttributes,
	agentRoyaltyConfig,
	agentHomeUrl,
} from '../_lib/three-brand.js';
import { getAgentCollection } from '../_lib/solana-collection.js';
import { solanaRpcEndpoints } from '../_lib/solana/connection.js';
import { generateSolanaAgentWallet } from '../_lib/agent-wallet.js';
import { publishFeedEvent } from '../_lib/feed.js';

// Genesis-hash chain refs (CAIP-2) for the onchain block, mirroring the
// interactive deploy path in api/agents/onchain/[action].js.
const SOLANA_REFS = {
	mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
	devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

// A Core asset minted into a collection costs ~0.0037 SOL of rent + fee. Pause
// the run if the funder can't cover one more mint with a little headroom.
const EST_MINT_LAMPORTS = Math.floor(0.004 * LAMPORTS_PER_SOL);
// Deploying the Collection account on first run costs ~0.003 SOL of rent + fee.
const EST_COLLECTION_LAMPORTS = Math.floor(0.005 * LAMPORTS_PER_SOL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sse(res, event, data) {
	if (!res.writableEnded) {
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	}
}

function explorerUrl(asset, network) {
	const suffix = network === 'devnet' ? '?cluster=devnet' : '';
	return `https://solscan.io/account/${asset}${suffix}`;
}

// Pin the manifest. Try web3.storage for true IPFS pinning; otherwise fall back
// to R2 while computing the real CIDv1 (raw codec, sha2-256) from the bytes, so
// the content is verifiable IPFS content-addressing and the returned HTTPS URL
// is real and resolvable — never a stub. Mirrors api/agents/onchain/[action].js.
async function pinManifest(manifest, agentId) {
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

// Resolve the three.ws Agent Collection for this network: prefer the env var
// (keeps the interactive deploy + edit paths aligned), then a persisted setting,
// then deploy the Collection account on first run and persist its address.
async function resolveCollection({ umi, authoritySigner, network, dryRun, res }) {
	const authority = authoritySigner.publicKey.toString();

	const envAddr = getAgentCollection(network);
	if (envAddr) {
		sse(res, 'collection', { address: envAddr, source: 'env', authority });
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
		sse(res, 'collection', { address: row.value.address, source: 'db', authority });
		return row.value.address;
	}

	if (dryRun) {
		sse(res, 'collection', { address: null, source: 'none', authority, dry_run: true });
		return null;
	}

	// First run for this network: deploy the Collection account, funded +
	// authority-signed by the funder. Needs ~0.003 SOL of rent + fee.
	const bal = await umi.rpc.getBalance(authoritySigner.publicKey).then((b) => Number(b.basisPoints)).catch(() => 0);
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
	sse(res, 'collection', { address, source: 'deployed', authority, signature });
	return address;
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;

	const q = req.query ?? {};
	const network = q.network === 'devnet' ? 'devnet' : 'mainnet';
	const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
	const dryRun = q.dry_run === 'true';

	// One funded wallet is the collection authority, the mint fee payer, and the
	// collection deployer. Prefer the canonical collection-authority key so the
	// interactive deploy/edit paths co-sign with the same authority; fall back to
	// the launch funder key.
	const signerSecret =
		process.env.SOLANA_AGENT_COLLECTION_AUTHORITY_KEY || process.env.LAUNCH_FUNDER_SECRET;
	if (!signerSecret) {
		return error(
			res,
			500,
			'config_error',
			'Set SOLANA_AGENT_COLLECTION_AUTHORITY_KEY (or LAUNCH_FUNDER_SECRET) to the funded authority wallet secret.',
		);
	}
	let authorityKeypair;
	try {
		authorityKeypair = Keypair.fromSecretKey(bs58.decode(signerSecret));
	} catch {
		return error(res, 500, 'config_error', 'authority/funder secret is not a valid base58 keypair');
	}

	// SSE headers
	res.statusCode = 200;
	res.setHeader('content-type', 'text/event-stream; charset=utf-8');
	res.setHeader('cache-control', 'no-cache, no-transform');
	res.setHeader('connection', 'keep-alive');
	res.setHeader('x-accel-buffering', 'no');

	let aborted = false;
	req.on('close', () => { aborted = true; });

	// Umi with the authority as identity (payer) + signer.
	const rpcUrl = solanaRpcEndpoints(network)[0];
	const umi = createUmi(rpcUrl).use(mplCore());
	const authoritySigner = createSignerFromKeypair(
		umi,
		umi.eddsa.createKeypairFromSecretKey(authorityKeypair.secretKey),
	);
	umi.use(signerIdentity(authoritySigner));
	const authorityPk = authoritySigner.publicKey;

	async function funderLamports() {
		try {
			const bal = await umi.rpc.getBalance(authorityPk);
			return Number(bal.basisPoints);
		} catch {
			return 0;
		}
	}

	const startBalance = await funderLamports();

	// Agents needing an on-chain identity on this network. mainnet uses the
	// canonical meta.sol_mint_address (what every read path keys on); devnet test
	// runs are isolated under meta.devnet so they never block a real mainnet mint.
	const agents =
		network === 'mainnet'
			? await sql`
				SELECT ai.id, ai.user_id, ai.name, ai.description, ai.meta, ai.avatar_id,
				       av.thumbnail_key, av.storage_key
				FROM agent_identities ai
				LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
				WHERE ai.deleted_at IS NULL
				  AND ai.meta->>'sol_mint_address' IS NULL
				ORDER BY ai.created_at ASC
				LIMIT ${limit}
			`
			: await sql`
				SELECT ai.id, ai.user_id, ai.name, ai.description, ai.meta, ai.avatar_id,
				       av.thumbnail_key, av.storage_key
				FROM agent_identities ai
				LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
				WHERE ai.deleted_at IS NULL
				  AND ai.meta->'devnet'->>'sol_mint_address' IS NULL
				ORDER BY ai.created_at ASC
				LIMIT ${limit}
			`;

	sse(res, 'init', {
		total: agents.length,
		network,
		funder: authorityPk.toString(),
		funder_balance_sol: startBalance / LAMPORTS_PER_SOL,
		dry_run: dryRun,
	});

	// Resolve (or deploy) the collection up front.
	let collectionAddr;
	try {
		collectionAddr = await resolveCollection({ umi, authoritySigner, network, dryRun, res });
	} catch (err) {
		sse(res, 'error', { agent_id: null, name: 'collection', error: `collection: ${err.message}` });
		sse(res, 'done', { deployed: 0, errors: 1, skipped: 0 });
		return res.end();
	}
	const collectionPk = collectionAddr ? umiPublicKey(collectionAddr) : null;

	let deployed = 0;
	let errors = 0;
	let skipped = 0;

	for (const agent of agents) {
		if (aborted) break;
		const agentName = agent.name || 'Agent';
		let meta = { ...(agent.meta || {}) };

		// 1. Owner = the agent's own custodial Solana wallet (generate if missing).
		//    The owner does not sign the mint, so it needs no SOL.
		if (!meta.solana_address) {
			if (!dryRun) {
				try {
					const wallet = await generateSolanaAgentWallet();
					meta = {
						...meta,
						solana_address: wallet.address,
						encrypted_solana_secret: wallet.encrypted_secret,
						solana_wallet_source: 'bulk_onchain',
					};
					await sql`
						UPDATE agent_identities
						SET meta = ${JSON.stringify(meta)}::jsonb, updated_at = NOW()
						WHERE id = ${agent.id}
					`;
				} catch (err) {
					sse(res, 'error', { agent_id: agent.id, name: agentName, error: `wallet: ${err.message}` });
					errors++;
					continue;
				}
			}
			sse(res, 'wallet', { agent_id: agent.id, name: agentName, owner: meta.solana_address || '(dry run)' });
		}
		const ownerAddress = meta.solana_address;

		// 2. Media + manifest.
		const image = agent.thumbnail_key ? r2PublicUrl(agent.thumbnail_key) : '';
		const animationUrl = agent.storage_key ? r2PublicUrl(agent.storage_key) : '';
		const createdAt = new Date().toISOString();

		if (dryRun) {
			sse(res, 'deployed', {
				agent_id: agent.id,
				name: agentName,
				asset: '(dry run)',
				owner: ownerAddress || '(dry run)',
				metadata_uri: null,
				signature: null,
				explorer_url: null,
				avatar_thumb: image || null,
				dry_run: true,
			});
			deployed++;
			continue;
		}

		// 3. Funder balance gate.
		const bal = await funderLamports();
		if (bal < EST_MINT_LAMPORTS + 5000) {
			sse(res, 'paused', {
				funder_balance_sol: bal / LAMPORTS_PER_SOL,
				deployed,
				reason: 'funder wallet is low on SOL — top up and re-run',
			});
			break;
		}

		try {
			// 4. Pin manifest.
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

			// 5. Mint the Core asset into the collection.
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

			// 6. Persist the on-chain identity. Mainnet writes the canonical fields
			//    every read path keys on; devnet is isolated under meta.devnet.
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

			// Truthful on-chain feed event — fired only after the tx confirms.
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

			deployed++;
			sse(res, 'deployed', {
				agent_id: agent.id,
				name: agentName,
				asset,
				owner: ownerAddress,
				metadata_uri: metadataUri,
				signature,
				explorer_url: explorerUrl(asset, network),
				avatar_thumb: image || null,
			});
		} catch (err) {
			sse(res, 'error', { agent_id: agent.id, name: agentName, error: `deploy: ${err.message}` });
			errors++;
		}

		// ~2 mints/sec — stay well within RPC limits.
		await sleep(400);
	}

	sse(res, 'done', { deployed, errors, skipped });
	res.end();
}
