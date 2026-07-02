#!/usr/bin/env node
// Wire ONE Solana wallet as the master signer for every autonomous engine.
//
// three.ws has no single "master wallet" env var — each engine loads its own
// keypair from its own env var (see api/_lib/solana-signers.js). This operator
// tool takes a single secret key and writes it into every signer slot, in the
// encoding each slot expects (base58 / base64), so one wallet funds+signs for
// all of them (the "approach A" consolidation).
//
// SECURITY
//   - The secret is read from a file or stdin, NEVER a CLI arg (shell history).
//   - It is decoded locally, its pubkey derived, and MUST match --pubkey
//     (default: the intended master) or the run aborts. This prevents wiring the
//     wrong wallet.
//   - The secret is never printed or logged. Env vars are set --sensitive.
//   - Default is a dry run: it prints the plan and sets nothing. Pass --apply.
//
// USAGE
//   # dry run (shows exactly what it would set, sets nothing):
//   node scripts/wire-master-wallet.mjs --secret-file ./master.key
//
//   # actually set every signer in Vercel production, overwriting existing:
//   node scripts/wire-master-wallet.mjs --secret-file ./master.key --apply --overwrite
//
//   # also set the preview environment:
//   node scripts/wire-master-wallet.mjs --secret-file ./master.key --apply --overwrite --preview
//
//   # pipe the secret instead of a file:
//   cat master.key | node scripts/wire-master-wallet.mjs --apply --overwrite
//
// After applying, verify balances/pubkeys with:
//   node scripts/check-relayer-balances.mjs
//
// The secret file may hold the key as base58, base64, or a JSON array of 64
// ints (Solana CLI keypair file) — all are auto-detected.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { decodeSecretKey } = await import(path.join(ROOT, 'api/_lib/solana-signers.js'));

// The intended master wallet. Override with --pubkey if you rotate it.
const DEFAULT_MASTER_PUBKEY = 'wwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW';

// Every signer slot that should resolve to the master, with the encoding its
// consumer expects. `enc` is what we WRITE; consumers that auto-detect accept
// any form, but slots with a strict decoder (e.g. *_B64 → base64-only) must
// match. Registry slots are documented in api/_lib/solana-signers.js.
const TARGETS = [
	// base64 (…_B64 / …_KEYPAIR consumers)
	{ env: 'LAUNCHER_MASTER_SECRET_KEY_B64', enc: 'base64', note: 'autonomous coin launcher master' },
	{ env: 'PUMP_X402_LAUNCHER_SECRET_KEY_B64', enc: 'base64', note: 'x402 pay-per-call launches' },
	{ env: 'PUMP_CRON_RELAYER_SECRET_KEY_B64', enc: 'base64', note: 'buyback + distribute crons' },
	{ env: 'THREE_BUYBACK_SECRET_KEY_B64', enc: 'base64', note: '$THREE buyback cron' },
	{ env: 'COIN_TREASURY_SECRET_KEY_B64', enc: 'base64', note: 'coin lottery/reflection payouts (strict base64)' },
	{ env: 'CLUB_SOLANA_TREASURY_SECRET_KEY_B64', enc: 'base64', note: 'club tip sweeps' },
	{ env: 'PLATFORM_TREASURY_KEYPAIR', enc: 'base64', note: 'shared platform treasury / withdrawal gas' },
	{ env: 'MARKETPLACE_PAYER_KEYPAIR', enc: 'base64', note: 'gasless checkout fee-payer' },
	// base58 (…_BASE58 and flexible treasury secrets)
	{ env: 'THREEWS_SOL_PARENT_SECRET_BASE58', enc: 'base58', note: 'threews.sol subdomain minting' },
	{ env: 'X402_SEED_SOLANA_SECRET_BASE58', enc: 'base58', note: 'x402 autonomous/seed spender' },
	{ env: 'LABOR_ESCROW_SECRET_BASE58', enc: 'base58', note: 'labor market escrow (already live — overwrite reroutes it!)' },
	{ env: 'VANITY_BOUNTY_PAYOUT_KEY', enc: 'base58', note: 'vanity bounty payouts (strict base58)' },
	{ env: 'CIRCULATION_TREASURY_SECRET', enc: 'base58', note: 'circulation engine treasury' },
	{ env: 'A2A_PAYER_SOLANA_SECRET', enc: 'base58', note: 'a2a mandate settlements' },
	{ env: 'REWARDS_DISTRIBUTOR_SECRET', enc: 'base58', note: '$THREE holder rewards distributor' },
	// Intentionally EXCLUDED:
	//   SOLANA_AGENT_COLLECTION_AUTHORITY_KEY — on-chain NFT-collection update
	//   authority; must stay the wallet that created the collection or NFT ops
	//   break. Do not overwrite with the master. Add --include-collection to force.
];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);

const APPLY = has('--apply');
const OVERWRITE = has('--overwrite');
const PREVIEW = has('--preview');
const INCLUDE_COLLECTION = has('--include-collection');
const EXPECTED_PUBKEY = val('--pubkey') || DEFAULT_MASTER_PUBKEY;
const secretFile = val('--secret-file');

function readSecret() {
	if (secretFile) {
		if (!fs.existsSync(secretFile)) fail(`--secret-file not found: ${secretFile}`);
		return fs.readFileSync(secretFile, 'utf8').trim();
	}
	if (process.env.MASTER_WALLET_SECRET) return process.env.MASTER_WALLET_SECRET.trim();
	if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8').trim();
	fail('No secret provided. Use --secret-file <path>, pipe it via stdin, or set MASTER_WALLET_SECRET.');
	return '';
}

function fail(msg) {
	console.error(`\n✗ ${msg}\n`);
	process.exit(1);
}

async function main() {
	const scopes = ['production', ...(PREVIEW ? ['preview'] : [])];
	const targets = INCLUDE_COLLECTION
		? [...TARGETS, { env: 'SOLANA_AGENT_COLLECTION_AUTHORITY_KEY', enc: 'base64', note: 'NFT collection authority (forced)' }]
		: TARGETS;

	const secret = readSecret();
	const bytes = await decodeSecretKey(secret);
	if (!bytes) fail('Could not decode the secret. Expect base58, base64, or a JSON array of 64 ints.');
	if (bytes.length !== 64) fail(`Decoded secret is ${bytes.length} bytes; expected a 64-byte secret key.`);

	const { Keypair } = await import('@solana/web3.js');
	const bs58mod = await import('bs58');
	const bs58 = bs58mod.default || bs58mod;
	const kp = Keypair.fromSecretKey(bytes);
	const pubkey = kp.publicKey.toBase58();

	if (pubkey !== EXPECTED_PUBKEY) {
		fail(
			`Refusing to run: the provided secret derives to\n    ${pubkey}\n` +
				`but the expected master wallet is\n    ${EXPECTED_PUBKEY}\n` +
				`If this is intentional, re-run with --pubkey ${pubkey}`,
		);
	}

	const encoded = {
		base64: Buffer.from(bytes).toString('base64'),
		base58: bs58.encode(bytes),
	};

	console.log(`\nMaster wallet: ${pubkey}`);
	console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing will change)'}${OVERWRITE ? '  overwrite=on' : ''}`);
	console.log(`Scopes: ${scopes.join(', ')}`);
	console.log(`Signer slots: ${targets.length}\n`);

	let ok = 0;
	let failed = 0;
	for (const t of targets) {
		const value = encoded[t.enc];
		for (const scope of scopes) {
			const label = `${t.env} [${scope}] (${t.enc})`;
			if (!APPLY) {
				console.log(`  would set  ${label}  — ${t.note}`);
				continue;
			}
			if (OVERWRITE) {
				// Remove first; ignore "not found". add fails if the var exists.
				spawnSync('vercel', ['env', 'rm', t.env, scope, '-y'], { stdio: ['ignore', 'ignore', 'ignore'] });
			}
			const res = spawnSync('vercel', ['env', 'add', t.env, scope, '--sensitive'], {
				input: value,
				encoding: 'utf8',
			});
			if (res.status === 0) {
				console.log(`  ✓ set      ${label}`);
				ok++;
			} else {
				console.log(`  ✗ FAILED   ${label} — ${(res.stderr || '').trim().split('\n').pop()}`);
				failed++;
			}
		}
	}

	if (!APPLY) {
		console.log(`\nDry run only. Re-run with --apply --overwrite to write these to Vercel.`);
	} else {
		console.log(`\nDone: ${ok} set, ${failed} failed.`);
		console.log(`Redeploy for changes to take effect, then verify:`);
		console.log(`  node scripts/check-relayer-balances.mjs`);
		if (failed) process.exitCode = 1;
	}
}

main().catch((e) => fail(e?.message || String(e)));
