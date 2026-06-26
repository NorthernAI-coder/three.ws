// POST /api/user/wallet/fund-agent
// Transfer USDC or SOL from the user's master wallet into one of their agent wallets.
// Body: { agent_id: string, amount: number | "max", asset: "SOL" | "USDC" }

import { getSessionUser } from '../../_lib/auth.js';
import { sql } from '../../_lib/db.js';
import { cors, json, error, wrap, method, readJson } from '../../_lib/http.js';
import { requireCsrf } from '../../_lib/csrf.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { recoverSolanaAgentKeypair } from '../../_lib/agent-wallet.js';
import { solanaConnection } from '../../_lib/agent-pumpfun.js';
import { validateSolanaAddress } from '../../_lib/agent-trade-guards.js';
import { recordEvent } from '../../_lib/usage.js';
import {
	PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;
const SOL_FEE_RESERVE_LAMPORTS = 20_000n;
const RENT_EXEMPT_FALLBACK_LAMPORTS = 890_880n;
const TOKEN_ACCOUNT_RENT_FALLBACK_LAMPORTS = 2_039_280n;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const session = await getSessionUser(req);
	if (!session) return error(res, 401, 'unauthorized', 'sign in required');

	if (!(await requireCsrf(req, res, session.id))) return;

	const rl = await limits.withdrawalPerUser(session.id);
	if (!rl.success) return json(res, 429, { error: 'rate_limited' });

	// Load master wallet
	const [mw] = await sql`
		SELECT solana_address, encrypted_solana_secret
		FROM master_wallets WHERE user_id = ${session.id}
	`;
	if (!mw?.solana_address) return error(res, 404, 'not_found', 'master wallet not set up');

	let body;
	try { body = await readJson(req); }
	catch (e) { return error(res, 400, 'bad_request', e?.message || 'invalid body'); }

	const agentId = body.agent_id;
	if (!agentId || typeof agentId !== 'string') return error(res, 400, 'bad_request', 'agent_id required');

	// Verify the agent belongs to this user
	const [agent] = await sql`
		SELECT id, meta FROM agent_identities
		WHERE id = ${agentId} AND user_id = ${session.id} AND deleted_at IS NULL
	`;
	if (!agent) return error(res, 403, 'forbidden', 'agent not found or not yours');

	const agentSolAddr = agent.meta?.solana_address;
	if (!agentSolAddr) return error(res, 400, 'no_agent_wallet', 'agent has no Solana wallet — provision one first');

	const asset = body.asset === 'SOL' ? 'SOL' : 'USDC';
	const isMax = body.amount === 'max' || body.amount === 'MAX';
	const amountNum = isMax ? null : Number(body.amount);
	if (!isMax && (!Number.isFinite(amountNum) || amountNum <= 0)) {
		return error(res, 400, 'invalid_amount', 'amount must be a positive number or "max"');
	}

	const conn = solanaConnection('mainnet');
	const fromPk = new PublicKey(mw.solana_address);
	const destPk = new PublicKey(agentSolAddr);
	const mintPk = new PublicKey(USDC_MINT);

	let balanceLamports;
	try { balanceLamports = BigInt(await conn.getBalance(fromPk, 'confirmed')); }
	catch { return error(res, 502, 'rpc_error', 'could not read balance'); }

	let ixs = [];
	let humanAmount, usdValue;

	if (asset === 'SOL') {
		let rentReserve;
		try { rentReserve = BigInt(await conn.getMinimumBalanceForRentExemption(0)); }
		catch { rentReserve = RENT_EXEMPT_FALLBACK_LAMPORTS; }

		let lamports;
		if (isMax) {
			const spendable = balanceLamports - rentReserve - SOL_FEE_RESERVE_LAMPORTS;
			if (spendable <= 0n) return error(res, 400, 'insufficient_balance', 'not enough SOL to send');
			lamports = spendable;
		} else {
			lamports = BigInt(Math.round(amountNum * 1e9));
			if (lamports <= 0n) return error(res, 400, 'invalid_amount', 'amount rounds to zero');
			if (balanceLamports - lamports < rentReserve + SOL_FEE_RESERVE_LAMPORTS) {
				return error(res, 400, 'insufficient_balance', 'insufficient SOL balance');
			}
		}
		humanAmount = Number(lamports) / 1e9;
		usdValue = null;
		ixs.push(SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: destPk, lamports }));
	} else {
		// USDC transfer
		const sourceAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
		const destAta = getAssociatedTokenAddressSync(mintPk, destPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

		let tokenBal;
		try { const b = await conn.getTokenAccountBalance(sourceAta); tokenBal = BigInt(b.value.amount); }
		catch { return error(res, 400, 'insufficient_balance', 'your master wallet holds no USDC'); }
		if (tokenBal <= 0n) return error(res, 400, 'insufficient_balance', 'your master wallet holds no USDC');

		const amountRaw = isMax ? tokenBal : BigInt(Math.round(amountNum * 10 ** USDC_DECIMALS));
		if (amountRaw <= 0n) return error(res, 400, 'invalid_amount', 'amount rounds to zero');
		if (amountRaw > tokenBal) return error(res, 400, 'insufficient_balance', 'amount exceeds your USDC balance');
		humanAmount = Number(amountRaw) / 10 ** USDC_DECIMALS;
		usdValue = humanAmount;

		let destInfo;
		try { destInfo = await conn.getAccountInfo(destAta); } catch { destInfo = null; }
		if (!destInfo) {
			let ataRent;
			try { ataRent = BigInt(await conn.getMinimumBalanceForRentExemption(165)); }
			catch { ataRent = TOKEN_ACCOUNT_RENT_FALLBACK_LAMPORTS; }
			if (balanceLamports < SOL_FEE_RESERVE_LAMPORTS + ataRent) {
				return error(res, 400, 'insufficient_sol_for_fees', 'need more SOL in master wallet for fees');
			}
			ixs.push(createAssociatedTokenAccountIdempotentInstruction(
				fromPk, destAta, destPk, mintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
			));
		}
		ixs.push(createTransferCheckedInstruction(sourceAta, mintPk, destAta, fromPk, amountRaw, USDC_DECIMALS, [], TOKEN_PROGRAM_ID));
	}

	const keypair = await recoverSolanaAgentKeypair(mw.encrypted_solana_secret, {
		agentId: `master:${session.id}`,
		userId: session.id,
		reason: 'master_wallet_fund_agent',
	});

	let blockhash;
	try { const bh = await conn.getLatestBlockhash('confirmed'); blockhash = bh.blockhash; }
	catch { return error(res, 502, 'rpc_error', 'could not get blockhash'); }

	const msg = new TransactionMessage({
		payerKey: fromPk,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const tx = new VersionedTransaction(msg);
	tx.sign([keypair]);

	let signature;
	try { signature = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 2 }); }
	catch (e) { return error(res, 502, 'send_failed', e?.message || 'transaction failed'); }

	recordEvent({
		userId: session.id,
		event: 'master_wallet_fund_agent',
		meta: { agent_id: agentId, asset, human_amount: humanAmount, signature },
	}).catch(() => {});

	return json(res, 200, {
		signature,
		explorer: `https://solscan.io/tx/${signature}`,
		asset,
		agent_id: agentId,
		agent_wallet: agentSolAddr,
		human_amount: humanAmount,
		usd_value: usdValue,
	});
});
