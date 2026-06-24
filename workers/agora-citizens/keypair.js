// agora-citizens — devnet keypair cache + faucet top-up. Each citizen (and the
// internal work dispatcher) keeps a stable signing keypair under .cache/ so it
// holds the same on-chain identity across restarts. Mirrors the proven approach
// in examples/agenc-task-roundtrip/run.mjs. NEVER commit .cache/ (see .gitignore).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '.cache');

function safeName(key) {
	return String(key).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'kp';
}

/** Load a cached keypair for `key`, or generate + persist a fresh one. */
export async function loadOrCreateKeypair(key) {
	const file = path.join(CACHE_DIR, `${safeName(key)}.json`);
	try {
		const raw = await fs.readFile(file, 'utf8');
		return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
	} catch (err) {
		if (err.code !== 'ENOENT') throw err;
		await fs.mkdir(CACHE_DIR, { recursive: true });
		const kp = Keypair.generate();
		await fs.writeFile(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
		log.info('keypair generated', { key, pubkey: kp.publicKey.toBase58() });
		return kp;
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Keep a signer funded above cfg.topupThresholdLamports. The public devnet
 * faucet is heavily rate-limited, so we request in shrinking chunks with backoff
 * (the @solana/web3.js example-script pattern) before surfacing a manual-funding
 * error. Returns the airdrop tx signature when one was performed, else null.
 */
export async function ensureBalance(connection, kp, cfg, label) {
	const bal = await connection.getBalance(kp.publicKey);
	if (bal >= cfg.topupThresholdLamports) return null;

	const full = cfg.airdropLamports || LAMPORTS_PER_SOL;
	const chunks = [full, full / 2, full / 4, full / 10];
	let lastErr = null;
	for (let attempt = 0; attempt < chunks.length; attempt++) {
		const lamports = Math.max(Math.floor(chunks[attempt]), Math.floor(LAMPORTS_PER_SOL / 100));
		try {
			const sig = await connection.requestAirdrop(kp.publicKey, lamports);
			await connection.confirmTransaction(sig, 'confirmed');
			const newBal = await connection.getBalance(kp.publicKey);
			log.info('airdrop confirmed', { label, sol: lamports / LAMPORTS_PER_SOL, sig, balance: newBal / LAMPORTS_PER_SOL });
			if (newBal >= cfg.topupThresholdLamports) return sig;
		} catch (err) {
			lastErr = err;
			const waitMs = cfg.retryBaseMs * (attempt + 1);
			log.warn('airdrop attempt failed', { label, attempt: attempt + 1, err: err?.message, retryMs: waitMs });
			await sleep(waitMs);
		}
	}
	throw new Error(
		`[agora-citizens] ${label}: devnet faucet exhausted retries — fund ${kp.publicKey.toBase58()} at https://faucet.solana.com or set AGENC_DEVNET_RPC_URL to a private RPC. Underlying: ${lastErr?.message || lastErr}`,
	);
}
