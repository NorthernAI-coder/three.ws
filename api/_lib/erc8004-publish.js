// @ts-check
// Autonomous ERC-8004 deployment — the WRITE side of the on-chain registry.
//
// The crawler (api/cron/erc8004-crawl) READS every Registered event other people
// emit. This module lets three.ws agents land on-chain themselves, with no
// browser, no wallet popup, no human in the loop: each agent already owns a
// custodial EVM wallet (agent_identities.wallet_address + encrypted key), so the
// server signs IdentityRegistry.register(agentURI) AS THE AGENT. The agent ends
// up owning its own ERC-8004 identity from its own address — not a shared relayer
// key. A platform relayer only sponsors the few cents of Base gas.
//
// Pipeline per agent (publishAgentOnchain):
//   1. Build the ERC-8004 registration manifest (avatar GLB service + x402 fields
//      so the crawler/feed mark it has_3d + x402-enabled) and pin it.
//   2. Recover the agent's custodial signer; top up gas from the relayer if low.
//   3. register(metadataURI) from the agent wallet, wait for the receipt.
//   4. Decode the Registered event → agentId; persist to agent_identities AND
//      upsert erc8004_agents_index so the /deployments feed shows it immediately
//      (no wait for the next crawl tick).
//   5. Publish the live-feed "agent-onchain" event.
//
// Every external boundary (pin, RPC, registry) is wrapped; a failure on one agent
// throws a typed PublishError the cron records and moves on — never half-writes.

import { Contract, Interface, Wallet, formatEther, parseEther } from 'ethers';
import { PutObjectCommand } from '@aws-sdk/client-s3';

import { sql } from './db.js';
import { env } from './env.js';
import { r2, publicUrl } from './r2.js';
import { evmFallbackProvider } from './evm/rpc.js';
import { recoverAgentKey } from './agent-wallet.js';
import { erc8004RegistryFields } from './three-brand.js';
import { IDENTITY_REGISTRY_MAINNET } from './erc8004-chains.js';
import { publishFeedEvent } from './feed.js';

export const BASE_CHAIN_ID = 8453;
const BASE_EXPLORER = 'https://basescan.org';

// Only the single-arg overload — naming the exact signature avoids ethers'
// "multiple matching functions" ambiguity on the overloaded register().
const REGISTER_ABI = [
	'function register(string agentURI) external returns (uint256 agentId)',
	'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
];
const REGISTRY_IFACE = new Interface(REGISTER_ABI);
const REGISTERED_TOPIC = REGISTRY_IFACE.getEvent('Registered').topicHash;

// Gas the agent wallet needs on hand to land register(). Base fees are a fraction
// of a cent; the stipend is deliberately generous so a fee spike can't strand a
// half-funded wallet, and is swept-once (only sent when the balance is below it).
const GAS_STIPEND_ETH = process.env.ERC8004_GAS_STIPEND_ETH || '0.00006';
// Below this, top the wallet up before registering.
const GAS_FLOOR_ETH = process.env.ERC8004_GAS_FLOOR_ETH || '0.00003';

export class PublishError extends Error {
	/** @param {string} code @param {string} message */
	constructor(code, message) {
		super(message);
		this.name = 'PublishError';
		this.code = code;
	}
}

/**
 * Resolve an avatar row's GLB + thumbnail into public HTTPS URLs the on-chain
 * metadata can point at. Returns null when the GLB isn't publicly resolvable —
 * we never publish an agent whose body 404s for everyone but its owner.
 * @param {{ glb_key?: string|null, thumbnail_key?: string|null, visibility?: string|null }} avatar
 */
export function resolveAvatarUrls(avatar) {
	if (!avatar?.glb_key) return null;
	if (avatar.visibility && avatar.visibility !== 'public' && avatar.visibility !== 'unlisted') {
		return null;
	}
	return {
		glbUrl: publicUrl(avatar.glb_key),
		imageUrl: avatar.thumbnail_key ? publicUrl(avatar.thumbnail_key) : '',
	};
}

/**
 * Build the ERC-8004 registration manifest for an agent. The `services[avatar]`
 * entry is what the crawler reads to set has_3d; erc8004RegistryFields supplies
 * the x402 / endpoint block. Pure — unit-testable without a DB or chain.
 * @param {{ name: string, description?: string|null }} agent
 * @param {{ glbUrl: string, imageUrl?: string }} urls
 * @param {string} [origin]
 */
export function buildAgentManifest(agent, urls, origin = env.APP_ORIGIN) {
	const o = String(origin || 'https://three.ws').replace(/\/$/, '');
	return {
		$schema: 'https://3d-agent.io/schemas/manifest/0.1.json',
		spec: 'agent-manifest/0.1',
		name: agent.name,
		description: agent.description || '',
		image: urls.imageUrl || '',
		tags: ['3d', 'avatar'],
		body: { uri: urls.glbUrl, format: 'gltf-binary' },
		services: [{ name: 'avatar', endpoint: urls.glbUrl, format: 'gltf-binary' }],
		...erc8004RegistryFields(o),
	};
}

/**
 * Persist the manifest. R2 is always the source of truth (returns a real HTTPS
 * metadataURI); IPFS pinning is layered on when a provider token is present.
 * Mirrors api/agents/register/[action].js so both registration paths agree.
 * @param {object} manifest
 * @returns {Promise<{ cid: string|null, metadataURI: string }>}
 */
export async function pinManifest(manifest) {
	const bytes = Buffer.from(JSON.stringify(manifest), 'utf-8');

	const storeToR2 = async () => {
		const key = `agent-registrations/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
		await r2.send(
			new PutObjectCommand({
				Bucket: env.S3_BUCKET,
				Key: key,
				Body: bytes,
				ContentType: 'application/json',
			}),
		);
		return publicUrl(key);
	};

	const web3Token = process.env.WEB3_STORAGE_TOKEN;
	if (web3Token) {
		try {
			const res = await fetch('https://api.web3.storage/upload', {
				method: 'POST',
				headers: { Authorization: `Bearer ${web3Token}` },
				body: bytes,
			});
			if (res.ok) {
				const r = await res.json();
				if (r.cid) {
					await storeToR2();
					return { cid: r.cid, metadataURI: `ipfs://${r.cid}` };
				}
			}
		} catch {
			/* fall through to next provider */
		}
	}

	const pinataJwt = process.env.PINATA_JWT;
	if (pinataJwt) {
		try {
			const form = new FormData();
			form.append(
				'file',
				new Blob([bytes], { type: 'application/json' }),
				'agent-manifest.json',
			);
			const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
				method: 'POST',
				headers: { Authorization: `Bearer ${pinataJwt}` },
				body: form,
			});
			if (res.ok) {
				const r = await res.json();
				if (r.IpfsHash) {
					await storeToR2();
					return { cid: r.IpfsHash, metadataURI: `ipfs://${r.IpfsHash}` };
				}
			}
		} catch {
			/* fall through to R2-only */
		}
	}

	const httpsUrl = await storeToR2();
	return { cid: null, metadataURI: httpsUrl };
}

/**
 * Recover (or lazily provision) the agent's custodial EVM signer, bound to a
 * Base provider.
 * @param {{ id: string, user_id?: string, wallet_address?: string|null, meta?: any }} agent
 * @param {import('ethers').Provider} provider
 */
async function agentSigner(agent, provider) {
	let encrypted = agent.meta?.encrypted_wallet_key;
	if (!encrypted) {
		const { getOrCreateAgentEvmWallet } = await import('./agent-wallet.js');
		await getOrCreateAgentEvmWallet(agent.id, { chainId: BASE_CHAIN_ID });
		const [row] = await sql`select meta from agent_identities where id = ${agent.id} limit 1`;
		encrypted = row?.meta?.encrypted_wallet_key;
	}
	if (!encrypted) throw new PublishError('no_custodial_key', 'agent has no custodial wallet key');
	const pk = await recoverAgentKey(encrypted, {
		agentId: agent.id,
		userId: agent.user_id,
		reason: 'erc8004_autopublish',
	});
	return new Wallet(pk, provider);
}

/**
 * Ensure the agent wallet can pay for register(); sponsor gas from the relayer if
 * it's below the floor. Returns the sponsoring tx hash, or null if no top-up was
 * needed.
 * @param {import('ethers').Wallet} relayer
 * @param {string} agentAddress
 * @param {import('ethers').Provider} provider
 */
async function ensureGas(relayer, agentAddress, provider) {
	const balance = await provider.getBalance(agentAddress);
	if (balance >= parseEther(GAS_FLOOR_ETH)) return null;
	const tx = await relayer.sendTransaction({
		to: agentAddress,
		value: parseEther(GAS_STIPEND_ETH),
	});
	await tx.wait(1);
	return tx.hash;
}

/**
 * Deploy one agent to the ERC-8004 Identity Registry on Base. Idempotent at the
 * caller level (skip agents that already carry erc8004_agent_id). Throws
 * PublishError on any boundary failure without leaving a partial DB write.
 *
 * @param {object} agent  joined agent_identities + avatar row:
 *   { id, user_id, name, description, wallet_address, meta,
 *     glb_key, thumbnail_key, visibility }
 * @param {object} [opts]
 * @param {import('ethers').Wallet} opts.relayer  gas sponsor (required)
 * @param {import('ethers').Provider} [opts.provider]
 * @returns {Promise<{ agentId: string, txHash: string, owner: string, metadataURI: string }>}
 */
export async function publishAgentOnchain(agent, { relayer, provider } = {}) {
	if (!relayer) throw new PublishError('no_relayer', 'gas relayer is required');
	if (!IDENTITY_REGISTRY_MAINNET) throw new PublishError('no_registry', 'registry address unset');

	const urls = resolveAvatarUrls({
		glb_key: agent.glb_key,
		thumbnail_key: agent.thumbnail_key,
		visibility: agent.visibility,
	});
	if (!urls) throw new PublishError('no_public_glb', 'agent has no publicly resolvable GLB');

	provider = provider || (await evmFallbackProvider(BASE_CHAIN_ID));

	// 1. Manifest + pin.
	const manifest = buildAgentManifest(agent, urls);
	const { cid, metadataURI } = await pinManifest(manifest);

	// 2. Signer + gas.
	const signer = await agentSigner(agent, provider);
	await ensureGas(relayer, signer.address, provider);

	// 3. register(metadataURI) AS THE AGENT.
	const registry = new Contract(IDENTITY_REGISTRY_MAINNET, REGISTER_ABI, signer);
	let receipt;
	try {
		const tx = await registry.register(metadataURI);
		receipt = await tx.wait(1);
	} catch (err) {
		throw new PublishError('register_failed', err?.shortMessage || err?.message || String(err));
	}
	if (!receipt || receipt.status !== 1) {
		throw new PublishError('register_reverted', 'register() reverted on-chain');
	}

	// 4. Decode the Registered event for the assigned agentId.
	let agentId = null;
	for (const log of receipt.logs) {
		if (
			log.address.toLowerCase() !== IDENTITY_REGISTRY_MAINNET.toLowerCase() ||
			log.topics[0] !== REGISTERED_TOPIC
		) {
			continue;
		}
		try {
			const parsed = REGISTRY_IFACE.parseLog({ topics: log.topics, data: log.data });
			agentId = parsed.args.agentId.toString();
			break;
		} catch {
			/* keep scanning */
		}
	}
	if (!agentId) throw new PublishError('no_event', 'Registered event missing from receipt');

	const owner = signer.address.toLowerCase();
	const registry_addr = IDENTITY_REGISTRY_MAINNET.toLowerCase();
	const block = receipt.blockNumber ?? null;
	const txHash = receipt.hash;
	const registeredAt = new Date().toISOString();

	// 5. Persist: agent_identities (our record) + erc8004_agents_index (the feed).
	await sql`
		update agent_identities
		set chain_id = ${BASE_CHAIN_ID},
		    erc8004_agent_id = ${agentId},
		    erc8004_registry = ${registry_addr},
		    registration_cid = ${cid},
		    updated_at = now()
		where id = ${agent.id}
	`;

	await sql`
		insert into erc8004_agents_index
			(chain_id, agent_id, owner, registry, agent_uri, name, description, image,
			 glb_url, services, x402_support, has_3d, active,
			 registered_block, registered_tx, registered_at, last_metadata_at, last_seen_at)
		values
			(${BASE_CHAIN_ID}, ${agentId}, ${owner}, ${registry_addr}, ${metadataURI},
			 ${agent.name || null}, ${agent.description || null}, ${urls.imageUrl || null},
			 ${urls.glbUrl}, ${JSON.stringify(manifest.services)}::jsonb, true, true, true,
			 ${block}, ${txHash}, ${registeredAt}, now(), now())
		on conflict (chain_id, agent_id) do update set
			owner = excluded.owner,
			agent_uri = excluded.agent_uri,
			name = excluded.name,
			description = excluded.description,
			image = excluded.image,
			glb_url = excluded.glb_url,
			services = excluded.services,
			x402_support = excluded.x402_support,
			has_3d = excluded.has_3d,
			active = true,
			registered_block = excluded.registered_block,
			registered_tx = excluded.registered_tx,
			registered_at = coalesce(erc8004_agents_index.registered_at, excluded.registered_at),
			last_metadata_at = now(),
			last_seen_at = now()
	`;

	// 6. Live feed — only after the tx is mined and indexed.
	publishFeedEvent({
		type: 'agent-onchain',
		ts: Date.now(),
		actor: agent.name || 'An agent',
		agentId: agent.id,
		name: agent.name || 'An agent',
		chain: 'Base',
		onchainId: agentId,
		txUrl: `${BASE_EXPLORER}/tx/${txHash}`,
		autonomous: true,
	}).catch(() => {});

	return { agentId, txHash, owner, metadataURI };
}

/**
 * Select agents eligible for autonomous deployment: public, not yet on-chain,
 * with a publicly resolvable 3D body. Oldest first so the backlog drains FIFO.
 * @param {number} limit
 */
export async function selectDeployableAgents(limit) {
	return sql`
		select i.id, i.user_id, i.name, i.description, i.wallet_address, i.meta,
		       a.storage_key as glb_key, a.thumbnail_key, a.visibility
		from agent_identities i
		join avatars a on a.id = i.avatar_id and a.deleted_at is null
		where i.deleted_at is null
		  and i.is_public = true
		  and i.erc8004_agent_id is null
		  and a.storage_key is not null
		  and a.visibility in ('public', 'unlisted')
		order by i.created_at asc
		limit ${limit}
	`;
}

export { GAS_STIPEND_ETH, GAS_FLOOR_ETH, formatEther };
