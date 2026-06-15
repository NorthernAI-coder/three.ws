// @ts-check
// Single source of truth for every Solana fee-paying signer the platform reads.
//
// Each signer is a keypair stored in an env var (NEVER committed). The platform
// loads it to pay transaction fees / rent for an on-chain flow. If one silently
// runs dry, that flow stops working with no warning — so the balance-check cron
// (api/cron/relayer-balance-check.js) and the operator script
// (scripts/check-relayer-balances.mjs) both read this registry, derive each
// pubkey, and compare its SOL balance against `minSol`.
//
// The human-readable companion (purpose, network, encoding, funding runbook) is
// tasks/onchain-deployment/SOLANA-SIGNERS.md — keep the two in sync.
//
// Encodings differ across signers (base64 of 64 raw bytes, base58, JSON array).
// `loadKeypairFromSecret` auto-detects, so callers never need to know which.

/**
 * @typedef {Object} SignerSpec
 * @property {string} name      human label for alerts/logs
 * @property {string} env       the env var holding the secret
 * @property {number} minSol    alert/refill threshold in SOL (mainnet)
 * @property {string} purpose   what this keypair pays for
 * @property {'mainnet'|'devnet'|'both'} network where it spends real SOL
 */

/** @type {SignerSpec[]} */
export const SOLANA_SIGNERS = [
	{
		name: 'pump-cron-relayer',
		env: 'PUMP_CRON_RELAYER_SECRET_KEY_B64',
		minSol: 0.1,
		purpose: 'pays fees + swap gas for the buyback and distribute-payments crons',
		network: 'both',
	},
	{
		name: 'pump-x402-launcher',
		env: 'PUMP_X402_LAUNCHER_SECRET_KEY_B64',
		minSol: 0.1,
		purpose: 'fronts the ~0.022 SOL deploy cost for x402 pay-per-call pump.fun launches',
		network: 'mainnet',
	},
	{
		name: 'sns-parent-owner',
		env: 'THREEWS_SOL_PARENT_SECRET_BASE58',
		minSol: 0.05,
		purpose: 'owns threews.sol; pays rent/fees minting *.threews.sol subdomains',
		network: 'mainnet',
	},
	{
		name: 'coin-treasury',
		env: 'COIN_TREASURY_SECRET_KEY_B64',
		minSol: 0.05,
		purpose: 'signs lottery/reflection distribution txs for launched coins',
		network: 'mainnet',
	},
	{
		name: 'club-treasury',
		env: 'CLUB_SOLANA_TREASURY_SECRET_KEY_B64',
		minSol: 0.05,
		purpose: 'pays USDC tip-sweep transfers + recipient ATA rent (club-payouts cron)',
		network: 'mainnet',
	},
	{
		name: 'platform-treasury',
		env: 'PLATFORM_TREASURY_KEYPAIR',
		fallbackEnv: 'TREASURY_KEYPAIR',
		minSol: 0.05,
		purpose: 'pays SPL withdrawal gas (process-withdrawals cron)',
		network: 'mainnet',
	},
	{
		name: 'a2a-payer',
		env: 'A2A_PAYER_SOLANA_SECRET',
		fallbackEnv: 'A2A_PAYER_SOLANA_PRIVATE_KEY',
		minSol: 0.02,
		purpose: 'co-signs SPL TransferChecked for agent-to-agent mandate settlements',
		network: 'mainnet',
	},
	{
		name: 'collection-authority',
		env: 'SOLANA_AGENT_COLLECTION_AUTHORITY_KEY',
		minSol: 0.02,
		purpose: 'creates/manages the three.ws agent NFT collection',
		network: 'both',
	},
];

/**
 * Decode a Solana secret key from any of the encodings used across the env:
 *   - JSON array of 64 ints (Solana CLI keypair file contents)
 *   - base64 of the 64 raw secret-key bytes (…_B64 vars)
 *   - base58 of the 64 raw secret-key bytes (…_BASE58 vars)
 * Returns the 64-byte Uint8Array, or null if it can't be decoded.
 * @param {string} secret
 * @returns {Promise<Uint8Array|null>}
 */
export async function decodeSecretKey(secret) {
	const raw = (secret || '').trim();
	if (!raw) return null;

	// JSON array form
	if (raw.startsWith('[')) {
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr) && (arr.length === 64 || arr.length === 32)) {
				return Uint8Array.from(arr);
			}
		} catch {
			/* fall through */
		}
	}

	// base64 form (…_B64). Buffer.from is lenient, so validate the byte length.
	try {
		const buf = Buffer.from(raw, 'base64');
		if (buf.length === 64 || buf.length === 32) {
			// Guard against base58 strings that happen to base64-decode to 64 bytes:
			// re-encode and compare, accept only on round-trip match.
			if (buf.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
				return new Uint8Array(buf);
			}
		}
	} catch {
		/* fall through */
	}

	// base58 form (…_BASE58)
	try {
		const bs58mod = await import('bs58');
		const bs58 = bs58mod.default || bs58mod;
		const bytes = bs58.decode(raw);
		if (bytes.length === 64 || bytes.length === 32) return Uint8Array.from(bytes);
	} catch {
		/* fall through */
	}

	return null;
}

/**
 * Resolve a SignerSpec to a loaded keypair pubkey (base58) using whichever env
 * var (primary or fallback) is set. Returns null when neither is configured or
 * the secret can't be decoded.
 * @param {SignerSpec & { fallbackEnv?: string }} spec
 * @returns {Promise<{ configured: boolean, pubkey: string|null, decodeError: boolean }>}
 */
export async function resolveSignerPubkey(spec) {
	const secret = process.env[spec.env] || (spec.fallbackEnv ? process.env[spec.fallbackEnv] : '');
	if (!secret) return { configured: false, pubkey: null, decodeError: false };

	const bytes = await decodeSecretKey(secret);
	if (!bytes) return { configured: true, pubkey: null, decodeError: true };

	const { Keypair } = await import('@solana/web3.js');
	try {
		const kp = Keypair.fromSecretKey(bytes);
		return { configured: true, pubkey: kp.publicKey.toBase58(), decodeError: false };
	} catch {
		return { configured: true, pubkey: null, decodeError: true };
	}
}
