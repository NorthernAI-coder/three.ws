// api/_lib/scrub-secrets.js
//
// Defense-in-depth for structured logs: recursively strip secret-bearing keys
// from any object before it is persisted. Every money-moving log path
// (circulation actions, custody events, ring reconciliation) writes a freeform
// `detail` blob; call sites are curated today, but a future field rename or a
// spread of a wallet/keypair object would otherwise silently write a private key
// into the database. This makes that structurally impossible.
//
// Pure, dependency-free, and cheap — safe to run on every write.

// Key names whose VALUE must never be logged, matched case-insensitively as a
// substring so `solanaSecretKey`, `encrypted_solana_secret`, `mnemonicPhrase`,
// etc. are all caught. Matching on the key (not the value) avoids false positives
// on legitimate data that merely looks random (mints, signatures, addresses).
const SECRET_KEY_PATTERNS = [
	'secret', 'privatekey', 'private_key', 'keypair', 'mnemonic', 'seed',
	'password', 'passphrase', 'apikey', 'api_key', 'token', 'bearer',
	'authorization', 'signingkey', 'signing_key',
];

const REDACTED = '[redacted]';

function isSecretKey(key) {
	const k = String(key).toLowerCase();
	return SECRET_KEY_PATTERNS.some((p) => k.includes(p));
}

/**
 * Return a deep copy of `value` with every secret-bearing key redacted at any
 * nesting depth. Arrays are walked element-wise. Non-plain values (strings,
 * numbers, BigInt, null) pass through untouched. Circular references are handled
 * so a live object (e.g. a Keypair with back-references) can be scrubbed safely.
 *
 * @param {*} value
 * @param {WeakSet} [seen] internal cycle guard
 * @returns {*}
 */
export function scrubSecrets(value, seen = new WeakSet()) {
	if (value == null || typeof value !== 'object') return value;
	if (seen.has(value)) return undefined; // drop cycles rather than throw
	seen.add(value);

	if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, seen));

	const out = {};
	for (const [k, v] of Object.entries(value)) {
		out[k] = isSecretKey(k) ? REDACTED : scrubSecrets(v, seen);
	}
	return out;
}
