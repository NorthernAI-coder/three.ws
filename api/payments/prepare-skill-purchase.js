/**
 * POST /api/payments/prepare-skill-purchase
 * Builds and returns a base64-serialised Solana VersionedTransaction that the
 * browser wallet signs and sends. The platform pre-signs as fee-payer so the
 * buyer needs no SOL — only the USDC for the skill price.
 *
 * Fee split: (price - platform_fee) → creator, platform_fee → treasury.
 * Both legs ride in one atomic transaction alongside the reference key.
 *
 * Body: { agentId, skillName, buyerPublicKey }
 * Returns: { transaction (base64), reference, recipient, amount, creator_amount,
 *            currency_mint, fee? }
 */
import {
	Keypair, PublicKey,
	TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	createTransferCheckedInstruction,
	getMint,
} from '@solana/spl-token';

import { solanaConnection } from '../_lib/solana/connection.js';
import { sql } from '../_lib/db.js';
import { authenticateBearer, extractBearer, getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, readJson, wrap, rateLimited } from '../_lib/http.js';
import { clientIp, limits } from '../_lib/rate-limit.js';
import { resolveMarketplaceFee } from '../_lib/marketplace-platform-fee.js';
import { decodeSecretKey } from '../_lib/solana-signers.js';
import { z } from 'zod';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const bodySchema = z.object({
	agentId:        z.string().uuid(),
	skillName:      z.string().trim().min(1).max(100),
	buyerPublicKey: z.string().regex(BASE58_RE, 'invalid public key'),
});

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Load the platform payer keypair that co-signs as fee-payer (gasless UX).
// Prefers MARKETPLACE_PAYER_KEYPAIR; falls back to PLATFORM_TREASURY_KEYPAIR.
// When neither is configured the endpoint still works but the buyer pays gas.
let _payerKeypair = undefined; // undefined = not yet resolved, null = not configured
async function resolvePlatformPayer() {
	if (_payerKeypair !== undefined) return _payerKeypair;
	const secret =
		process.env.MARKETPLACE_PAYER_KEYPAIR ||
		process.env.PLATFORM_TREASURY_KEYPAIR ||
		process.env.TREASURY_KEYPAIR ||
		'';
	if (!secret) { _payerKeypair = null; return null; }
	const bytes = await decodeSecretKey(secret);
	if (!bytes) { _payerKeypair = null; return null; }
	try {
		_payerKeypair = Keypair.fromSecretKey(bytes);
	} catch {
		_payerKeypair = null;
	}
	return _payerKeypair;
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req).catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return error(res, 400, 'validation_error', parsed.error.issues[0]?.message || 'validation error');
	}

	const { agentId, skillName, buyerPublicKey } = parsed.data;

	// Fetch active price
	const [price] = await sql`
		SELECT amount, currency_mint, chain, mint_decimals
		FROM agent_skill_prices
		WHERE agent_id = ${agentId} AND skill = ${skillName} AND is_active = true
		LIMIT 1
	`;
	if (!price) return error(res, 404, 'not_found', 'skill is not for sale');
	if (price.chain !== 'solana') {
		return error(res, 400, 'unsupported_chain', `chain '${price.chain}' does not support prepared transactions`);
	}

	// Resolve payout wallet
	const [payout] = await sql`
		SELECT pw.address
		FROM agent_identities a
		JOIN agent_payout_wallets pw
		  ON pw.user_id = a.user_id
		 AND pw.chain = 'solana'
		 AND (pw.agent_id = a.id OR pw.is_default = true)
		WHERE a.id = ${agentId} AND a.deleted_at IS NULL
		ORDER BY (pw.agent_id IS NOT NULL) DESC, pw.is_default DESC, pw.created_at ASC
		LIMIT 1
	`;
	let recipient = payout?.address;
	if (!recipient) {
		const [row] = await sql`SELECT meta FROM agent_identities WHERE id = ${agentId}`;
		recipient = row?.meta?.solana_address ?? null;
	}
	if (!recipient) return error(res, 412, 'creator_wallet_missing', 'agent owner has not configured a payout wallet');

	// Platform fee
	const grossAtomics = BigInt(price.amount);
	const feeInfo = await resolveMarketplaceFee({ grossAtomics });
	const platformFeeAtomics = feeInfo ? feeInfo.feeAtomics : 0n;
	const creatorAtomics = grossAtomics - platformFeeAtomics;

	// Reference keypair for Solana Pay tracking
	const referenceKeypair = Keypair.generate();
	const referenceKey = referenceKeypair.publicKey;
	const reference = referenceKey.toBase58();

	// Record pending purchase
	await sql`
		INSERT INTO skill_purchases
			(user_id, agent_id, skill, status, reference, amount, currency_mint, chain,
			 platform_fee_amount, platform_fee_wallet)
		VALUES
			(${auth.userId}, ${agentId}, ${skillName}, 'pending', ${reference},
			 ${price.amount}, ${price.currency_mint}, 'solana',
			 ${platformFeeAtomics.toString()},
			 ${feeInfo ? feeInfo.recipient.toBase58() : null})
		ON CONFLICT DO NOTHING
	`;

	// Build the SPL token transfer instructions
	const connection = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

	const mintInfo = await getMint(connection, new PublicKey(price.currency_mint));
	const decimals = mintInfo.decimals;

	const buyer    = new PublicKey(buyerPublicKey);
	const mintKey  = new PublicKey(price.currency_mint);
	const fromAta  = getAssociatedTokenAddressSync(mintKey, buyer);

	const creatorKey = new PublicKey(recipient);
	const toAta      = getAssociatedTokenAddressSync(mintKey, creatorKey);

	// Creator leg — append reference key so findReference can locate this tx
	const creatorIx = createTransferCheckedInstruction(
		fromAta, mintKey, toAta, buyer, creatorAtomics, decimals,
	);
	creatorIx.keys.push({ pubkey: referenceKey, isSigner: false, isWritable: false });

	const instructions = [creatorIx];

	// Platform fee leg (same tx — atomic)
	if (platformFeeAtomics > 0n && feeInfo?.recipient) {
		const treasuryAta = getAssociatedTokenAddressSync(mintKey, feeInfo.recipient);
		instructions.push(
			createTransferCheckedInstruction(
				fromAta, mintKey, treasuryAta, buyer, platformFeeAtomics, decimals,
			),
		);
	}

	// Platform co-signs as fee-payer (gasless for the buyer).
	// Falls back to buyer-pays if no payer keypair is configured.
	const platformPayer = await resolvePlatformPayer();
	const feePayer = platformPayer ? platformPayer.publicKey : buyer;

	const messageV0 = new TransactionMessage({
		payerKey: feePayer,
		recentBlockhash: blockhash,
		instructions,
	}).compileToV0Message();

	const tx = new VersionedTransaction(messageV0);

	if (platformPayer) {
		tx.sign([platformPayer]);
	}

	const serialized = Buffer.from(tx.serialize());

	const feeBlock = platformFeeAtomics > 0n && feeInfo
		? {
				fee: {
					recipient: feeInfo.recipient.toBase58(),
					amount:    platformFeeAtomics.toString(),
					bps:       feeInfo.bps,
				},
			}
		: {};

	return json(res, 200, {
		data: {
			transaction:    serialized.toString('base64'),
			reference,
			recipient,
			amount:         String(price.amount),
			creator_amount: creatorAtomics.toString(),
			currency_mint:  price.currency_mint,
			mint_decimals:  price.mint_decimals ?? decimals,
			gasless:        !!platformPayer,
			label:          `Skill: ${skillName.slice(0, 40)}`,
			message:        `Unlock '${skillName}' for this agent`,
			...feeBlock,
		},
	});
});
