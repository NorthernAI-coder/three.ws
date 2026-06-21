// $THREE allowance — chain operations (read status, build grant, execute pull).
//
// Pure encodings live in ./allowance.js (unit-tested). This module is the thin
// RPC/signing shell: it talks to Solana to read a user's remaining allowance,
// assemble the one-signature grant transaction, and — with the platform delegate
// key — pull a charge across split legs without a user popup.

import { PublicKey, Transaction } from '@solana/web3.js';
import {
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_2022_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { solanaConnection } from '../solana/connection.js';
import { TOKEN_MINT, ATOMICS_PER_TOKEN } from './config.js';
import {
	SUBSCRIPTIONS_PROGRAM_ID,
	subscriptionAuthorityPda,
	fixedDelegationPda,
	userThreeAta,
	ixInitSubscriptionAuthority,
	ixCreateFixedDelegation,
	ixTransferFixed,
	parseSubscriptionAuthorityInitId,
	parseFixedDelegation,
	loadDelegateKeypair,
	delegateAddress,
} from './allowance.js';

const mintPubkey = () => new PublicKey(TOKEN_MINT);
const nowSec = () => Math.floor(Date.now() / 1000);

function conn(network = 'mainnet') {
	return solanaConnection({ network });
}

/** A delegation is spendable when it has remaining balance and is not past expiry (0 = no expiry). */
function isLive(d, now = nowSec()) {
	return d.remaining > 0n && (d.expiryTs <= 0 || d.expiryTs > now);
}

/**
 * Read every active fixed delegation the user has granted to the platform delegate.
 * Returns the parsed, still-live ones (largest remaining first) plus the aggregate.
 */
export async function getAllowanceStatus(userWallet, { network = 'mainnet' } = {}) {
	const delegate = await delegateAddress();
	if (!delegate) {
		return { enabled: false, delegate: null, remaining_atomics: '0', delegations: [] };
	}

	const connection = conn(network);
	let accounts = [];
	try {
		accounts = await connection.getProgramAccounts(SUBSCRIPTIONS_PROGRAM_ID, {
			filters: [
				{ dataSize: 187 },
				{ memcmp: { offset: 3, bytes: new PublicKey(userWallet).toBase58() } },
				{ memcmp: { offset: 35, bytes: delegate } },
			],
		});
	} catch (err) {
		// Read path: never throw — a degraded RPC simply shows "no allowance" and the
		// caller falls back to the signed quote flow.
		console.warn('[allowance] getProgramAccounts failed:', err?.message || err);
		return { enabled: true, delegate, remaining_atomics: '0', delegations: [], degraded: true };
	}

	const now = nowSec();
	const delegations = accounts
		.map(({ pubkey, account }) => {
			const parsed = parseFixedDelegation(account.data);
			return parsed ? { pubkey: pubkey.toBase58(), ...parsed } : null;
		})
		.filter((d) => d && isLive(d, now))
		.sort((a, b) => (b.remaining > a.remaining ? 1 : b.remaining < a.remaining ? -1 : 0));

	const totalRemaining = delegations.reduce((s, d) => s + d.remaining, 0n);
	return {
		enabled: true,
		delegate,
		remaining_atomics: totalRemaining.toString(),
		remaining_tokens: Number(totalRemaining) / Number(ATOMICS_PER_TOKEN),
		delegations: delegations.map((d) => ({
			pubkey: d.pubkey,
			remaining_atomics: d.remaining.toString(),
			expiry_ts: d.expiryTs,
		})),
	};
}

/**
 * Build the user-signed GRANT transaction: initialize the Subscription Authority
 * if absent, then create a fixed delegation for `capAtomics` until `expiryTs`.
 * Returns the unsigned tx (base64), the delegation PDA, and the chosen nonce.
 */
export async function buildGrantTransaction({
	userWallet,
	capAtomics,
	expiryTs = 0,
	network = 'mainnet',
}) {
	const delegate = await delegateAddress();
	if (!delegate) {
		throw Object.assign(new Error('allowance delegate not configured'), {
			status: 503,
			code: 'allowance_unavailable',
		});
	}

	const owner = new PublicKey(userWallet);
	const mint = mintPubkey();
	const sa = subscriptionAuthorityPda(owner, mint);
	const connection = conn(network);

	const instructions = [];
	let expectedInitId;
	const saInfo = await connection.getAccountInfo(sa, 'confirmed');
	if (!saInfo) {
		instructions.push(ixInitSubscriptionAuthority({ owner, mint }));
		// Fresh SA: the program stamps init-id = on-chain clock; our current second
		// is within TIME_DRIFT_ALLOWED_SECS so createFixedDelegation accepts it.
		expectedInitId = nowSec();
	} else {
		expectedInitId = parseSubscriptionAuthorityInitId(saInfo.data);
		if (expectedInitId == null) {
			throw Object.assign(new Error('unreadable subscription authority'), {
				status: 422,
				code: 'sa_unreadable',
			});
		}
	}

	const nonce = nowSec();
	instructions.push(
		ixCreateFixedDelegation({
			delegator: owner,
			delegatee: new PublicKey(delegate),
			nonce,
			amount: BigInt(capAtomics),
			expiryTs: Math.floor(expiryTs) || 0,
			expectedInitId,
			mint,
		}),
	);

	const { blockhash } = await connection.getLatestBlockhash('confirmed');
	const tx = new Transaction();
	tx.add(...instructions);
	tx.feePayer = owner;
	tx.recentBlockhash = blockhash;

	const serialized = tx
		.serialize({ requireAllSignatures: false, verifySignatures: false })
		.toString('base64');

	return {
		transaction: serialized,
		delegation_pda: fixedDelegationPda({
			subscriptionAuthority: sa,
			delegator: owner,
			delegatee: new PublicKey(delegate),
			nonce,
		}).toBase58(),
		nonce,
		recent_blockhash: blockhash,
	};
}

/**
 * Pull `legs` (each { address, atomics }) from the user's wallet against an
 * existing allowance, in a single delegate-signed transaction — no user popup.
 *
 * Honors the exact split the quote path would: one transferFixed per leg, each
 * decrementing the same delegation. Returns { signature, ... } on success.
 *
 * Throws code 'insufficient_allowance' when no single live delegation covers the
 * total — the caller treats that as "fall back to the signed quote flow".
 */
export async function pullFromAllowance({ userWallet, legs, network = 'mainnet' }) {
	const delegate = await loadDelegateKeypair();
	if (!delegate) {
		throw Object.assign(new Error('allowance delegate not configured'), {
			status: 503,
			code: 'allowance_unavailable',
		});
	}

	const total = legs.reduce((s, l) => s + BigInt(l.atomics), 0n);
	if (total <= 0n) {
		throw Object.assign(new Error('nothing to charge'), { status: 400, code: 'zero_charge' });
	}

	const status = await getAllowanceStatus(userWallet, { network });
	// Pick the single delegation that covers the whole charge (legs share one cap).
	const covering = status.delegations.find((d) => BigInt(d.remaining_atomics) >= total);
	if (!covering) {
		throw Object.assign(
			new Error('no active allowance covers this charge'),
			{ status: 402, code: 'insufficient_allowance', remaining_atomics: status.remaining_atomics },
		);
	}

	const owner = new PublicKey(userWallet);
	const mint = mintPubkey();
	const connection = conn(network);
	const tx = new Transaction();

	for (const leg of legs) {
		const receiver = new PublicKey(leg.address);
		// Idempotent: fund the receiver ATA's rent on first use (delegate is fee payer).
		tx.add(
			createAssociatedTokenAccountIdempotentInstruction(
				delegate.publicKey,
				userThreeAta(receiver, mint),
				receiver,
				mint,
				TOKEN_2022_PROGRAM_ID,
				ASSOCIATED_TOKEN_PROGRAM_ID,
			),
		);
		tx.add(
			ixTransferFixed({
				delegationPda: covering.pubkey,
				delegator: owner,
				delegatee: delegate.publicKey,
				receiver,
				amount: BigInt(leg.atomics),
				mint,
			}),
		);
	}

	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	tx.feePayer = delegate.publicKey;
	tx.recentBlockhash = blockhash;
	tx.sign(delegate);

	const signature = await connection.sendRawTransaction(tx.serialize(), {
		skipPreflight: false,
		maxRetries: 3,
	});
	const confirmation = await connection.confirmTransaction(
		{ signature, blockhash, lastValidBlockHeight },
		'confirmed',
	);
	if (confirmation.value?.err) {
		throw Object.assign(new Error('allowance pull failed on-chain'), {
			status: 502,
			code: 'pull_failed',
			detail: confirmation.value.err,
		});
	}

	return {
		signature,
		delegation_pda: covering.pubkey,
		total_atomics: total.toString(),
		slot: confirmation.context?.slot ?? null,
	};
}
