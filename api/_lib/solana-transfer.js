import { PublicKey, Keypair } from '@solana/web3.js';
import { solanaConnection } from './solana/connection.js';
import { submitProtected } from './execution-engine.js';
import {
	getAssociatedTokenAddress,
	createAssociatedTokenAccountInstruction,
	createTransferInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Transfer SPL tokens from the platform treasury to a recipient address.
 * @param {object} opts
 * @param {string} opts.fromWallet   base58-encoded treasury keypair (64 bytes)
 * @param {string} opts.toAddress    recipient Solana address
 * @param {bigint|number} opts.amount  token amount in smallest units (e.g. 6-decimal USDC)
 * @param {string} opts.mint         SPL mint address
 * @returns {Promise<string>}        transaction signature
 */
export async function transferSolanaUSDC({ fromWallet, toAddress, amount, mint }) {
	const kp = Keypair.fromSecretKey(bs58.decode(fromWallet));
	const mintPubkey = new PublicKey(mint);
	const recipientPubkey = new PublicKey(toAddress);

	const connection = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });

	const senderATA = await getAssociatedTokenAddress(mintPubkey, kp.publicKey);
	const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

	const instructions = [];
	const recipientAccount = await connection.getAccountInfo(recipientATA);
	if (!recipientAccount) {
		instructions.push(createAssociatedTokenAccountInstruction(kp.publicKey, recipientATA, recipientPubkey, mintPubkey));
	}
	instructions.push(createTransferInstruction(senderATA, recipientATA, kp.publicKey, BigInt(amount)));

	// Protected send: data-driven priority fee + CU, rebroadcast with blockhash
	// refresh until it lands, and a hard throw on an on-chain revert — replaces the
	// previous send-once-and-confirm, which dropped silently under congestion.
	const { signature } = await submitProtected({
		network: 'mainnet',
		connection,
		payer: kp,
		instructions,
	});
	return signature;
}
