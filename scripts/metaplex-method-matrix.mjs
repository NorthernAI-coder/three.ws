/**
 * Metaplex deployment-method matrix — mainnet proof rig.
 * ---------------------------------------------------------------------------
 * Exercises every DISTINCT non-fungible Metaplex deployment path the repo's
 * installed SDKs support, end-to-end on mainnet, and reports the on-chain id +
 * explorer link + SOL spent per method. This is a STANDARDS test rig: each
 * artifact is named "Metaplex Method NN — <standard>" and branded to three.ws.
 * It never creates a fungible token (only $THREE exists) — every path here is
 * an NFT / collection / compressed asset.
 *
 * SDK generations covered:
 *   • umi:      @metaplex-foundation/mpl-core, mpl-agent-registry
 *   • web3.js:  @metaplex-foundation/mpl-token-metadata@2, mpl-bubblegum@0.6
 *   • spl:      @solana/spl-token Token-2022 metadata extension
 *
 * Secrets are read from /tmp (never the repo): /tmp/funder.b58, /tmp/helius_rpc.txt.
 * Dry-run by default; pass --go to broadcast. --only=core,tm,t22,cnft to filter.
 */

import fs from 'fs';

// ── umi stack (Core + Agent Registry) ──
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
	generateSigner,
	publicKey as umiPk,
	createSignerFromKeypair,
	signerIdentity,
	some,
	none,
} from '@metaplex-foundation/umi';
import {
	mplCore,
	create as coreCreate,
	createCollection as coreCreateCollection,
	fetchCollection as coreFetchCollection,
	ruleSet,
	findAssetSignerPda,
} from '@metaplex-foundation/mpl-core';
import {
	mplAgentIdentity,
	registerIdentityV1,
} from '@metaplex-foundation/mpl-agent-registry';

// ── web3.js stack ──
import {
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	SystemProgram,
	LAMPORTS_PER_SOL,
	SYSVAR_INSTRUCTIONS_PUBKEY,
	sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

// ── SPL token / Token-2022 ──
import {
	MINT_SIZE,
	TOKEN_PROGRAM_ID,
	TOKEN_2022_PROGRAM_ID,
	ExtensionType,
	getMintLen,
	getAssociatedTokenAddressSync,
	createInitializeMint2Instruction,
	createInitializeMintInstruction,
	createInitializeMetadataPointerInstruction,
	createAssociatedTokenAccountInstruction,
	createMintToInstruction,
	TYPE_SIZE,
	LENGTH_SIZE,
} from '@solana/spl-token';
import {
	pack as packTokenMetadata,
	createInitializeInstruction as createInitMetadataField,
} from '@solana/spl-token-metadata';

// ── Token Metadata (legacy web3.js, v2) ──
import {
	PROGRAM_ID as TM_PROGRAM_ID,
	createCreateMetadataAccountV3Instruction,
	createCreateMasterEditionV3Instruction,
	createCreateInstruction as tmCreateInstruction,
	createVerifySizedCollectionItemInstruction,
	createMintNewEditionFromMasterEditionViaTokenInstruction,
	TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';

// ── Bubblegum compressed NFTs (legacy web3.js, v0.6) ──
import {
	PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
	createCreateTreeInstruction,
	createMintV1Instruction,
	createMintToCollectionV1Instruction,
	TokenProgramVersion,
	TokenStandard as BgumTokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import {
	createAllocTreeIx,
	SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
	SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';

const GO = process.argv.includes('--go');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const groups = ONLY ? new Set(ONLY.split(',')) : null;
const want = (g) => !groups || groups.has(g);

const METADATA_URI = 'https://three.ws/.well-known/agent-registration.json';
const COLLECTION_URI = 'https://three.ws/api/agents/solana-collection-metadata?network=mainnet';
const ROYALTY_BPS = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadFunder() {
	return Keypair.fromSecretKey(bs58.decode(fs.readFileSync('/tmp/funder.b58', 'utf8').trim()));
}
function loadRpc() {
	return fs.readFileSync('/tmp/helius_rpc.txt', 'utf8').trim();
}

function brandAttributes(name) {
	return [
		{ key: 'method', value: name },
		{ key: 'standard', value: 'metaplex-method-matrix' },
	];
}

const exAsset = (id) => `https://solscan.io/token/${id}`;
const exTx = (sig) => `https://solscan.io/tx/${sig}`;

// ── results + spend tracking ─────────────────────────────────────────────
const results = [];
let umiGlobal, connGlobal, payerGlobal;

async function lamports(pubkey) {
	return connGlobal.getBalance(pubkey, 'confirmed');
}

/**
 * Run one method, isolate failures, and record SOL spent (balance delta).
 * fn returns { id, sig, note }. id = primary on-chain account (asset/mint/tree).
 */
async function method(n, label, standard, sdk, fn) {
	const row = { n, label, standard, sdk, ok: false, id: '', sig: '', spent: 0, err: '' };
	console.log(`\n[${String(n).padStart(2, '0')}] ${label}  (${standard} · ${sdk})`);
	const before = await lamports(payerGlobal.publicKey);
	try {
		const out = await fn();
		row.ok = true;
		row.id = out.id || '';
		row.sig = out.sig || '';
		if (out.note) row.note = out.note;
		console.log(`     ✓ id=${row.id}`);
		if (row.sig) console.log(`       tx=${exTx(row.sig)}`);
	} catch (err) {
		row.err = (err?.message || String(err)).slice(0, 200);
		console.log(`     ✗ ${row.err}`);
	}
	await sleep(1500);
	const after = await lamports(payerGlobal.publicKey);
	row.spent = Math.max(0, (before - after) / LAMPORTS_PER_SOL);
	results.push(row);
	return row;
}

async function sendIxs(ixs, signers, label) {
	const tx = new Transaction().add(...ixs);
	const sig = await sendAndConfirmTransaction(connGlobal, tx, signers, {
		commitment: 'confirmed',
		skipPreflight: false,
	});
	return sig;
}

// ── PDA helpers (Token Metadata) ─────────────────────────────────────────
function metadataPda(mint) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('metadata'), TM_PROGRAM_ID.toBuffer(), mint.toBuffer()],
		TM_PROGRAM_ID,
	)[0];
}
function masterEditionPda(mint) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('metadata'), TM_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
		TM_PROGRAM_ID,
	)[0];
}
function editionMarkPda(masterMint, editionNumber) {
	const page = Math.floor(editionNumber / 248).toString();
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from('metadata'),
			TM_PROGRAM_ID.toBuffer(),
			masterMint.toBuffer(),
			Buffer.from('edition'),
			Buffer.from(page),
		],
		TM_PROGRAM_ID,
	)[0];
}

const tmCreators = (payer) => [
	{ address: payer, verified: true, share: 100 },
];

// Build a fresh NFT mint (decimals 0, supply 1) under the classic SPL token program.
async function mintOneNft(payer) {
	const mint = Keypair.generate();
	const rent = await connGlobal.getMinimumBalanceForRentExemption(MINT_SIZE);
	const ata = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey);
	const ixs = [
		SystemProgram.createAccount({
			fromPubkey: payer.publicKey,
			newAccountPubkey: mint.publicKey,
			space: MINT_SIZE,
			lamports: rent,
			programId: TOKEN_PROGRAM_ID,
		}),
		createInitializeMint2Instruction(mint.publicKey, 0, payer.publicKey, payer.publicKey),
		createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mint.publicKey),
		createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1),
	];
	return { mint, ata, ixs };
}

// Collections can lag the RPC index right after deploy; fetch with backoff.
async function fetchCollectionWithRetry(umi, addr, tries = 8) {
	for (let i = 0; ; i++) {
		try {
			return await coreFetchCollection(umi, umiPk(addr));
		} catch (err) {
			if (i >= tries) throw err;
			await sleep(3000);
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE (umi · mpl-core)
// ═══════════════════════════════════════════════════════════════════════════
async function runCore() {
	const umi = umiGlobal;
	const signer = umi.identity;

	// 01 — minimal standalone Core asset
	await method(1, 'Core asset (minimal)', 'Metaplex Core', 'mpl-core/umi', async () => {
		const asset = generateSigner(umi);
		const r = await coreCreate(umi, {
			asset,
			name: 'Metaplex Method 01 — Core asset',
			uri: METADATA_URI,
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		return { id: asset.publicKey.toString(), sig: bs58.encode(r.signature) };
	});

	// 02 — Core asset with full plugin set
	await method(2, 'Core asset (Attributes+Royalties+VerifiedCreators+Immutable)', 'Metaplex Core', 'mpl-core/umi', async () => {
		const asset = generateSigner(umi);
		const r = await coreCreate(umi, {
			asset,
			name: 'Metaplex Method 02 — Core +plugins',
			uri: METADATA_URI,
			plugins: [
				{ type: 'Attributes', attributeList: brandAttributes('core-plugins') },
				{
					type: 'Royalties',
					basisPoints: ROYALTY_BPS,
					creators: [{ address: signer.publicKey, percentage: 100 }],
					ruleSet: ruleSet('None'),
				},
				{ type: 'VerifiedCreators', signatures: [{ address: signer.publicKey, verified: true }] },
				{ type: 'ImmutableMetadata' },
			],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		return { id: asset.publicKey.toString(), sig: bs58.encode(r.signature) };
	});

	// 03 — Core collection
	let collectionAddr = null;
	await method(3, 'Core collection', 'Metaplex Core', 'mpl-core/umi', async () => {
		const collection = generateSigner(umi);
		const r = await coreCreateCollection(umi, {
			collection,
			name: 'Metaplex Method 03 — Core collection',
			uri: COLLECTION_URI,
			plugins: [{ type: 'Attributes', attributeList: brandAttributes('core-collection') }],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		collectionAddr = collection.publicKey.toString();
		return { id: collectionAddr, sig: bs58.encode(r.signature) };
	});

	// 04 — Core asset minted INTO the collection (member)
	await method(4, 'Core asset → collection member', 'Metaplex Core', 'mpl-core/umi', async () => {
		if (!collectionAddr) throw new Error('collection from #03 unavailable');
		const collectionAsset = await fetchCollectionWithRetry(umi, collectionAddr);
		const asset = generateSigner(umi);
		const r = await coreCreate(umi, {
			asset,
			collection: collectionAsset,
			authority: signer,
			name: 'Metaplex Method 04 — Core member',
			uri: METADATA_URI,
			plugins: [{ type: 'Attributes', attributeList: brandAttributes('core-member') }],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		return { id: asset.publicKey.toString(), sig: bs58.encode(r.signature), note: `in ${collectionAddr}` };
	});

	// 05 — Core asset + Metaplex Agent Registry binding (EIP-8004)
	await method(5, 'Core asset + Agent Registry (registerIdentityV1)', 'Metaplex Core + Agent Registry', 'mpl-agent-registry/umi', async () => {
		if (!collectionAddr) throw new Error('collection from #03 unavailable');
		const collectionAsset = await fetchCollectionWithRetry(umi, collectionAddr);
		const asset = generateSigner(umi);
		const r1 = await coreCreate(umi, {
			asset,
			collection: collectionAsset,
			authority: signer,
			name: 'Metaplex Method 05 — Core agent',
			uri: METADATA_URI,
			plugins: [
				{ type: 'Attributes', attributeList: brandAttributes('core-agent') },
				{ type: 'VerifiedCreators', signatures: [{ address: signer.publicKey, verified: true }] },
			],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		// The registry program reads the freshly-created asset; retry on the
		// propagation race that surfaces as "Invalid Core Asset".
		for (let i = 0; ; i++) {
			try {
				await sleep(2500);
				await registerIdentityV1(umi, {
					asset: asset.publicKey,
					collection: umiPk(collectionAddr),
					payer: signer,
					authority: signer,
					agentRegistrationUri: METADATA_URI,
				}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
				break;
			} catch (err) {
				const racey = /Invalid Core Asset|was not confirmed|blockhash|0x4\b/i.test(err?.message || '');
				if (!racey || i >= 6) throw err;
			}
		}
		return { id: asset.publicKey.toString(), sig: bs58.encode(r1.signature), note: 'registered in agent registry' };
	});

	// 06 — Core asset with an asset-signer (PDA wallet) the asset controls
	await method(6, 'Core asset with controllable asset-signer wallet', 'Metaplex Core', 'mpl-core/umi', async () => {
		const asset = generateSigner(umi);
		const r = await coreCreate(umi, {
			asset,
			name: 'Metaplex Method 06 — Core +wallet',
			uri: METADATA_URI,
			plugins: [{ type: 'Attributes', attributeList: brandAttributes('core-wallet') }],
		}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
		const [walletPda] = findAssetSignerPda(umi, { asset: asset.publicKey });
		return { id: asset.publicKey.toString(), sig: bs58.encode(r.signature), note: `asset-signer ${walletPda.toString()}` };
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN METADATA (web3.js · mpl-token-metadata v2)
// ═══════════════════════════════════════════════════════════════════════════
let tmMasterMint = null; // shared so #10 can print from #07
let tmMasterAta = null;
let tmCollectionMint = null; // shared so cNFT-to-collection can use it

async function runTokenMetadata() {
	const payer = payerGlobal;

	// 07 — classic NonFungible NFT (mint + MetadataV3 + MasterEditionV3)
	await method(7, 'Classic NFT (MetadataV3 + MasterEditionV3)', 'Token Metadata', 'mpl-token-metadata@2/web3.js', async () => {
		const { mint, ata, ixs } = await mintOneNft(payer);
		const md = metadataPda(mint.publicKey);
		const me = masterEditionPda(mint.publicKey);
		ixs.push(
			createCreateMetadataAccountV3Instruction(
				{ metadata: md, mint: mint.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, updateAuthority: payer.publicKey },
				{
					createMetadataAccountArgsV3: {
						data: { name: 'Method 07 Classic NFT', symbol: 'M3', uri: METADATA_URI, sellerFeeBasisPoints: ROYALTY_BPS, creators: tmCreators(payer.publicKey), collection: null, uses: null },
						isMutable: true,
						collectionDetails: null,
					},
				},
			),
			createCreateMasterEditionV3Instruction(
				{ edition: me, mint: mint.publicKey, updateAuthority: payer.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, metadata: md },
				{ createMasterEditionArgs: { maxSupply: 10 } },
			),
		);
		const sig = await sendIxs(ixs, [payer, mint], 'classic-nft');
		tmMasterMint = mint.publicKey;
		tmMasterAta = ata;
		return { id: mint.publicKey.toString(), sig };
	});

	// 08 — Programmable NFT (pNFT) via the unified create handler
	await method(8, 'Programmable NFT (pNFT)', 'Token Metadata', 'mpl-token-metadata@2/web3.js', async () => {
		const mint = Keypair.generate();
		const md = metadataPda(mint.publicKey);
		const me = masterEditionPda(mint.publicKey);
		const ix = tmCreateInstruction(
			{
				metadata: md,
				masterEdition: me,
				mint: mint.publicKey,
				authority: payer.publicKey,
				payer: payer.publicKey,
				updateAuthority: payer.publicKey,
				sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
				splTokenProgram: TOKEN_PROGRAM_ID,
			},
			{
				createArgs: {
					__kind: 'V1',
					assetData: {
						name: 'Metaplex Method 08 — pNFT',
						symbol: 'M3',
						uri: METADATA_URI,
						sellerFeeBasisPoints: ROYALTY_BPS,
						creators: tmCreators(payer.publicKey),
						primarySaleHappened: false,
						isMutable: true,
						tokenStandard: TokenStandard.ProgrammableNonFungible,
						collection: null,
						uses: null,
						collectionDetails: null,
						ruleSet: null,
					},
					decimals: 0,
					printSupply: { __kind: 'Zero' },
				},
			},
		);
		// mint must sign (the create handler initializes the mint account).
		const sig = await sendIxs([ix], [payer, mint], 'pnft');
		return { id: mint.publicKey.toString(), sig };
	});

	// 09 — Verified sized collection (parent NFT + item + verify)
	await method(9, 'Verified sized collection + member', 'Token Metadata', 'mpl-token-metadata@2/web3.js', async () => {
		// parent collection NFT (collectionDetails => sized collection)
		const parent = await mintOneNft(payer);
		const pMd = metadataPda(parent.mint.publicKey);
		const pMe = masterEditionPda(parent.mint.publicKey);
		parent.ixs.push(
			createCreateMetadataAccountV3Instruction(
				{ metadata: pMd, mint: parent.mint.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, updateAuthority: payer.publicKey },
				{
					createMetadataAccountArgsV3: {
						data: { name: 'Method 09 Collection', symbol: 'M3C', uri: COLLECTION_URI, sellerFeeBasisPoints: 0, creators: tmCreators(payer.publicKey), collection: null, uses: null },
						isMutable: true,
						collectionDetails: { __kind: 'V1', size: 0 },
					},
				},
			),
			createCreateMasterEditionV3Instruction(
				{ edition: pMe, mint: parent.mint.publicKey, updateAuthority: payer.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, metadata: pMd },
				{ createMasterEditionArgs: { maxSupply: 0 } },
			),
		);
		const parentSig = await sendIxs(parent.ixs, [payer, parent.mint], 'collection-parent');
		tmCollectionMint = parent.mint.publicKey;
		await sleep(2000);

		// item NFT pointing at the collection (unverified), then verify
		const item = await mintOneNft(payer);
		const iMd = metadataPda(item.mint.publicKey);
		const iMe = masterEditionPda(item.mint.publicKey);
		item.ixs.push(
			createCreateMetadataAccountV3Instruction(
				{ metadata: iMd, mint: item.mint.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, updateAuthority: payer.publicKey },
				{
					createMetadataAccountArgsV3: {
						data: { name: 'Method 09 Member', symbol: 'M3C', uri: METADATA_URI, sellerFeeBasisPoints: ROYALTY_BPS, creators: tmCreators(payer.publicKey), collection: { key: parent.mint.publicKey, verified: false }, uses: null },
						isMutable: true,
						collectionDetails: null,
					},
				},
			),
			createCreateMasterEditionV3Instruction(
				{ edition: iMe, mint: item.mint.publicKey, updateAuthority: payer.publicKey, mintAuthority: payer.publicKey, payer: payer.publicKey, metadata: iMd },
				{ createMasterEditionArgs: { maxSupply: 0 } },
			),
		);
		await sendIxs(item.ixs, [payer, item.mint], 'collection-item');
		await sleep(2000);

		const verifyIx = createVerifySizedCollectionItemInstruction({
			metadata: iMd,
			collectionAuthority: payer.publicKey,
			payer: payer.publicKey,
			collectionMint: parent.mint.publicKey,
			collection: pMd,
			collectionMasterEditionAccount: pMe,
		});
		const sig = await sendIxs([verifyIx], [payer], 'verify-collection');
		return { id: item.mint.publicKey.toString(), sig, note: `verified in collection ${parent.mint.publicKey.toString()}` };
	});

	// 10 — Printed edition from the #07 master
	await method(10, 'Printed edition from master', 'Token Metadata', 'mpl-token-metadata@2/web3.js', async () => {
		if (!tmMasterMint) throw new Error('master from #07 unavailable');
		const edition = await mintOneNft(payer); // the print is itself a 1-supply mint
		const newMd = metadataPda(edition.mint.publicKey);
		const newEd = masterEditionPda(edition.mint.publicKey);
		const editionNumber = 1;
		const markPda = editionMarkPda(tmMasterMint, editionNumber);
		const ix = createMintNewEditionFromMasterEditionViaTokenInstruction(
			{
				newMetadata: newMd,
				newEdition: newEd,
				masterEdition: masterEditionPda(tmMasterMint),
				newMint: edition.mint.publicKey,
				editionMarkPda: markPda,
				newMintAuthority: payer.publicKey,
				payer: payer.publicKey,
				tokenAccountOwner: payer.publicKey,
				tokenAccount: tmMasterAta,
				newMetadataUpdateAuthority: payer.publicKey,
				metadata: metadataPda(tmMasterMint),
			},
			{ mintNewEditionFromMasterEditionViaTokenArgs: { edition: editionNumber } },
		);
		const sig = await sendIxs([...edition.ixs, ix], [payer, edition.mint], 'print-edition');
		return { id: edition.mint.publicKey.toString(), sig, note: `edition #${editionNumber} of ${tmMasterMint.toString()}` };
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN-2022 (spl-token · metadata pointer + embedded metadata extension)
// ═══════════════════════════════════════════════════════════════════════════
async function runToken2022() {
	const payer = payerGlobal;
	await method(11, 'Token-2022 NFT (MetadataPointer + embedded metadata)', 'SPL Token-2022', '@solana/spl-token', async () => {
		const mint = Keypair.generate();
		const metadata = {
			mint: mint.publicKey,
			name: 'Metaplex Method 11 — T22 NFT',
			symbol: 'M3T22',
			uri: METADATA_URI,
			additionalMetadata: [['platform', 'three.ws'], ['standard', 'token-2022-metadata']],
		};
		const mintLen = getMintLen([ExtensionType.MetadataPointer]);
		const metadataLen = TYPE_SIZE + LENGTH_SIZE + packTokenMetadata(metadata).length;
		const rent = await connGlobal.getMinimumBalanceForRentExemption(mintLen + metadataLen);
		const ata = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
		const ixs = [
			SystemProgram.createAccount({
				fromPubkey: payer.publicKey,
				newAccountPubkey: mint.publicKey,
				space: mintLen,
				lamports: rent,
				programId: TOKEN_2022_PROGRAM_ID,
			}),
			createInitializeMetadataPointerInstruction(mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
			createInitializeMintInstruction(mint.publicKey, 0, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
			createInitMetadataField({
				programId: TOKEN_2022_PROGRAM_ID,
				metadata: mint.publicKey,
				updateAuthority: payer.publicKey,
				mint: mint.publicKey,
				mintAuthority: payer.publicKey,
				name: metadata.name,
				symbol: metadata.symbol,
				uri: metadata.uri,
			}),
			createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
			createMintToInstruction(mint.publicKey, ata, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
		];
		const sig = await sendIxs(ixs, [payer, mint], 't22-nft');
		return { id: mint.publicKey.toString(), sig };
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// BUBBLEGUM (web3.js · compressed NFTs)
// ═══════════════════════════════════════════════════════════════════════════
function treeAuthorityPda(merkleTree) {
	return PublicKey.findProgramAddressSync([merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0];
}
function bubblegumSignerPda() {
	return PublicKey.findProgramAddressSync([Buffer.from('collection_cpi')], BUBBLEGUM_PROGRAM_ID)[0];
}
function bgMetadata(name, collectionMint) {
	return {
		name,
		symbol: 'M3CMP',
		uri: METADATA_URI,
		sellerFeeBasisPoints: ROYALTY_BPS,
		primarySaleHappened: false,
		isMutable: true,
		editionNonce: null,
		tokenStandard: BgumTokenStandard.NonFungible,
		collection: collectionMint ? { key: collectionMint, verified: false } : null,
		uses: null,
		tokenProgramVersion: TokenProgramVersion.Original,
		creators: [{ address: payerGlobal.publicKey, verified: false, share: 100 }],
	};
}

async function runBubblegum() {
	const payer = payerGlobal;
	const maxDepth = 5;
	const maxBufferSize = 8; // valid concurrent-merkle-tree pair; 32-leaf capacity
	let merkleTreePk = null;

	// 12 — create tree + mint a compressed NFT
	await method(12, 'Compressed NFT (alloc tree + mintV1)', 'Bubblegum (compressed)', 'mpl-bubblegum@0.6/web3.js', async () => {
		const merkleTree = Keypair.generate();
		merkleTreePk = merkleTree.publicKey;
		const treeAuthority = treeAuthorityPda(merkleTree.publicKey);
		const allocIx = await createAllocTreeIx(connGlobal, merkleTree.publicKey, payer.publicKey, { maxDepth, maxBufferSize }, 0);
		const createTreeIx = createCreateTreeInstruction(
			{
				treeAuthority,
				merkleTree: merkleTree.publicKey,
				payer: payer.publicKey,
				treeCreator: payer.publicKey,
				logWrapper: SPL_NOOP_PROGRAM_ID,
				compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
			},
			{ maxDepth, maxBufferSize, public: false },
		);
		const treeSig = await sendIxs([allocIx, createTreeIx], [payer, merkleTree], 'create-tree');
		await sleep(2000);

		const mintIx = createMintV1Instruction(
			{
				treeAuthority,
				leafOwner: payer.publicKey,
				leafDelegate: payer.publicKey,
				merkleTree: merkleTree.publicKey,
				payer: payer.publicKey,
				treeDelegate: payer.publicKey,
				logWrapper: SPL_NOOP_PROGRAM_ID,
				compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
				tokenMetadataProgram: TM_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
			},
			{ message: bgMetadata('Method 12 cNFT', null) },
		);
		const sig = await sendIxs([mintIx], [payer], 'mint-cnft');
		return { id: merkleTree.publicKey.toString(), sig, note: 'compressed leaf in tree' };
	});

	// 13 — mint a compressed NFT directly INTO the verified collection from #09
	await method(13, 'Compressed NFT → verified collection (mintToCollectionV1)', 'Bubblegum (compressed)', 'mpl-bubblegum@0.6/web3.js', async () => {
		if (!merkleTreePk) throw new Error('tree from #12 unavailable');
		if (!tmCollectionMint) throw new Error('collection from #09 unavailable');
		const treeAuthority = treeAuthorityPda(merkleTreePk);
		const collMd = metadataPda(tmCollectionMint);
		const collMe = masterEditionPda(tmCollectionMint);
		const mintIx = createMintToCollectionV1Instruction(
			{
				treeAuthority,
				leafOwner: payer.publicKey,
				leafDelegate: payer.publicKey,
				merkleTree: merkleTreePk,
				payer: payer.publicKey,
				treeDelegate: payer.publicKey,
				collectionAuthority: payer.publicKey,
				collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID, // none => program id sentinel
				collectionMint: tmCollectionMint,
				collectionMetadata: collMd,
				editionAccount: collMe,
				bubblegumSigner: bubblegumSignerPda(),
				logWrapper: SPL_NOOP_PROGRAM_ID,
				compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
				tokenMetadataProgram: TM_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
			},
			{ metadataArgs: bgMetadata('Method 13 cNFT collection', tmCollectionMint) },
		);
		const sig = await sendIxs([mintIx], [payer], 'mint-cnft-collection');
		return { id: merkleTreePk.toString(), sig, note: `compressed, verified in ${tmCollectionMint.toString()}` };
	});
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
	const rpc = loadRpc();
	const funder = loadFunder();
	connGlobal = new Connection(rpc, 'confirmed');
	payerGlobal = funder;

	const umi = createUmi(rpc).use(mplCore()).use(mplAgentIdentity());
	const umiSigner = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(funder.secretKey));
	umi.use(signerIdentity(umiSigner));
	umiGlobal = umi;

	const startBal = (await lamports(funder.publicKey)) / LAMPORTS_PER_SOL;
	console.log('══ Metaplex method matrix ══');
	console.log('mode:     ', GO ? 'LIVE (broadcasting to mainnet)' : 'DRY RUN');
	console.log('authority:', funder.publicKey.toString());
	console.log('balance:  ', startBal.toFixed(6), 'SOL');
	console.log('groups:   ', groups ? [...groups].join(',') : 'all (core, tm, t22, cnft)');

	if (!GO) {
		console.log('\nDry run — re-run with --go to broadcast.');
		console.log('Methods that WOULD run:');
		console.log('  core: 01-06  tm: 07-10  t22: 11  cnft: 12-13');
		return;
	}

	if (want('core')) await runCore();
	if (want('tm')) await runTokenMetadata();
	if (want('t22')) await runToken2022();
	if (want('cnft')) await runBubblegum();

	const endBal = (await lamports(funder.publicKey)) / LAMPORTS_PER_SOL;

	console.log('\n\n══════════════════ RESULTS ══════════════════');
	const ok = results.filter((r) => r.ok);
	const fail = results.filter((r) => !r.ok);
	for (const r of results) {
		const status = r.ok ? '✓' : '✗';
		console.log(`${status} [${String(r.n).padStart(2, '0')}] ${r.label}`);
		console.log(`     ${r.standard} · ${r.sdk}`);
		if (r.ok) {
			console.log(`     id:    ${r.id}`);
			console.log(`     link:  ${exAsset(r.id)}`);
			if (r.sig) console.log(`     tx:    ${exTx(r.sig)}`);
			if (r.note) console.log(`     note:  ${r.note}`);
		} else {
			console.log(`     error: ${r.err}`);
		}
		console.log(`     spent: ${r.spent.toFixed(6)} SOL`);
	}
	console.log('\n─────────────────────────────────────────────');
	console.log(`deployed: ${ok.length}/${results.length} methods`);
	if (fail.length) console.log(`failed:   ${fail.map((r) => r.n).join(', ')}`);
	console.log(`spent:    ${(startBal - endBal).toFixed(6)} SOL`);
	console.log(`balance:  ${endBal.toFixed(6)} SOL remaining`);

	// Persist a machine-readable report off-repo.
	const report = { authority: funder.publicKey.toString(), startBal, endBal, results };
	fs.writeFileSync('/tmp/metaplex-method-matrix-report.json', JSON.stringify(report, null, 2));
	console.log('\nreport: /tmp/metaplex-method-matrix-report.json');
}

main().catch((e) => {
	console.error('\nFATAL:', e?.message || e);
	process.exit(1);
});
