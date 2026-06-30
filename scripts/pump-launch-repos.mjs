#!/usr/bin/env node
/**
 * pump-launch-repos.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Launch one pump.fun coin per public GitHub repo of a target user, with 100% of
 * creator rewards delegated to that user's GitHub identity via the pump.fun
 * social-fee escrow (the same mechanism behind "someone launched $THREE but the
 * rewards go to @nirholas").
 *
 * How the GitHub-reward routing works
 *   pump.fun derives a deterministic escrow PDA from the numeric GitHub user id:
 *   socialFeePda(githubUserId, 2)  (platform 2 = GitHub). We launch each coin
 *   normally (the throwaway repo wallet is the on-chain creator + payer), then
 *   create a fee-sharing config and set the ONLY shareholder to that escrow PDA
 *   at 10000 bps (100%). The repo wallet keeps 0%. The GitHub owner later claims
 *   from the escrow by linking a Solana wallet (or, if already linked on
 *   three.ws, fees route straight to it via the permissionless distribute crank).
 *
 * Wallet model
 *   One master wallet (you fund it once) → funds 112 throwaway repo wallets →
 *   each repo wallet launches its own coin. Every private key is written ONLY
 *   under .pump-launch-wallets/ (gitignored) and bundled into a downloadable zip.
 *
 * Subcommands
 *   generate   Create master + per-repo keypairs, manifest, CSV, README, zip.
 *   status     Print funding + launch progress.
 *   preflight  Upload real metadata + build (not send) the launch/fee-share
 *              instructions for one repo to prove the pipeline end-to-end.
 *   fund       Transfer SOL from master → each unfunded repo wallet.
 *   launch     For each repo wallet: create coin + set 100% fee-share → GitHub.
 *   run        fund, then launch (requires a funded master).
 *
 * Flags
 *   --network <mainnet|devnet>   default mainnet
 *   --rpc <url>                  override RPC (recommended: a Helius URL for
 *                                mainnet; the default three.ws proxy rate-limits)
 *   --github-user <login>        default nirholas
 *   --github-id <id>             default 22895867 (numeric GitHub id of the user)
 *   --dev-buy <sol>              initial buy per coin, default 0.0001
 *   --fund-per-wallet <sol>      SOL sent to each repo wallet, default 0.04
 *   --include-forks              include forked repos (default: skip)
 *   --include-archived           include archived repos (default: skip)
 *   --limit <n>                  cap repo count (testing)
 *   --only <repo>                operate on a single repo
 *   --yes                        skip the confirmation prompt before spending
 *
 * Real money. mainnet launches are irreversible. Nothing is sent until you run
 * `fund` / `launch` / `run` against a funded master wallet.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

import {
	Keypair,
	Connection,
	PublicKey,
	Transaction,
	SystemProgram,
	ComputeBudgetProgram,
	LAMPORTS_PER_SOL,
	sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
	PumpSdk,
	OnlinePumpSdk,
	socialFeePda,
	feeSharingConfigPda,
	canonicalPumpPoolPda,
	getBuyTokenAmountFromSolAmount,
} from '@pump-fun/pump-sdk';
import bs58 from 'bs58';
import BN from 'bn.js';

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WALLET_DIR = join(ROOT, '.pump-launch-wallets');
const MANIFEST = join(WALLET_DIR, 'manifest.json');
const PROGRESS = join(WALLET_DIR, 'progress.json');
const MASTER_FILE = join(WALLET_DIR, 'master.json');
const ZIP_PATH = join(ROOT, 'pump-launch-wallets.zip');

// ── Args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
	const a = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const t = argv[i];
		if (t.startsWith('--')) {
			const key = t.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) a[key] = true;
			else {
				a[key] = next;
				i++;
			}
		} else a._.push(t);
	}
	return a;
}
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'help';

const NETWORK = args.network === 'devnet' ? 'devnet' : 'mainnet';
const GITHUB_USER = args['github-user'] || 'nirholas';
const GITHUB_ID = String(args['github-id'] || '22895867');
const PLATFORM_GITHUB = 2; // pump.fun social platform id for GitHub
const DEV_BUY_SOL = Number(args['dev-buy'] ?? 0.0001);
const FUND_PER_WALLET_SOL = Number(args['fund-per-wallet'] ?? 0.04);
const INCLUDE_FORKS = Boolean(args['include-forks']);
const INCLUDE_ARCHIVED = Boolean(args['include-archived']);
const LIMIT = args.limit ? Number(args.limit) : null;
const ONLY = args.only || null;
const ASSUME_YES = Boolean(args.yes);

const DEFAULT_RPC = {
	mainnet: 'https://three.ws/api/solana-rpc',
	devnet: 'https://api.devnet.solana.com',
};
const RPC_URL = args.rpc || process.env.SOLANA_RPC_URL || DEFAULT_RPC[NETWORK];

const SOCIAL_PDA = socialFeePda(GITHUB_ID, PLATFORM_GITHUB);

// ── tiny utilities ───────────────────────────────────────────────────────────
const sol = (lamports) => (lamports / LAMPORTS_PER_SOL).toFixed(6);
const lamports = (s) => Math.round(s * LAMPORTS_PER_SOL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(...m) {
	console.log(...m);
}
function die(msg) {
	console.error(`\n✗ ${msg}\n`);
	process.exit(1);
}
function explorer(sig) {
	return `https://solscan.io/tx/${sig}${NETWORK === 'devnet' ? '?cluster=devnet' : ''}`;
}

function loadJson(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return fallback;
	}
}
function saveJson(path, data) {
	writeFileSync(path, JSON.stringify(data, null, 2));
}
function keypairFromFile(path) {
	return Keypair.fromSecretKey(Uint8Array.from(loadJson(path)));
}

function loadProgress() {
	return loadJson(PROGRESS, {});
}
function saveProgress(p) {
	saveJson(PROGRESS, p);
}

async function confirm(question) {
	if (ASSUME_YES) return true;
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const ans = await new Promise((r) => rl.question(`${question} [y/N] `, r));
	rl.close();
	return /^y(es)?$/i.test(ans.trim());
}

// ── GitHub repo enumeration (via authed gh CLI) ──────────────────────────────
function fetchReposOnce() {
	const jq =
		'.[] | select(.private==false' +
		(INCLUDE_FORKS ? '' : ' and .fork==false') +
		(INCLUDE_ARCHIVED ? '' : ' and .archived==false') +
		') | {name, description, default_branch}';
	const res = spawnSync(
		'gh',
		['api', `users/${GITHUB_USER}/repos?per_page=100&type=owner`, '--paginate', '--jq', jq],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
	if (res.status !== 0) die(`gh api failed: ${res.stderr || res.stdout}`);
	return res.stdout
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

// GitHub's paginated list endpoint can return a short page on a transient hiccup,
// silently undercounting (this bit us once: 112 instead of 145). Fetch twice and
// union by repo name so a one-off short page never drops repos.
function fetchRepos() {
	const byName = new Map();
	for (let pass = 0; pass < 2; pass++) {
		for (const r of fetchReposOnce()) if (!byName.has(r.name)) byName.set(r.name, r);
	}
	return [...byName.values()];
}

// Derive a <=10 char uppercase ticker, unique across the set.
function makeSymbol(name, used) {
	let base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
	if (!base) base = 'COIN';
	let sym = base;
	let n = 1;
	while (used.has(sym)) {
		const suffix = String(n++);
		sym = base.slice(0, 10 - suffix.length) + suffix;
	}
	used.add(sym);
	return sym;
}

// ── SDK / connection ─────────────────────────────────────────────────────────
function makeConnection() {
	return new Connection(RPC_URL, 'confirmed');
}
function makeSdk(connection) {
	const offline = new PumpSdk();
	const online = new OnlinePumpSdk(connection);
	return { offline, online };
}

// Priority fee + CU budget so launch txs land under load.
function budgetIxs(microLamports = 200_000, units = 400_000) {
	return [
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
		ComputeBudgetProgram.setComputeUnitLimit({ units }),
	];
}

async function sendTx(connection, instructions, payer, extraSigners = []) {
	const tx = new Transaction();
	tx.add(...budgetIxs(), ...instructions);
	const sig = await sendAndConfirmTransaction(connection, tx, [payer, ...extraSigners], {
		commitment: 'confirmed',
		skipPreflight: false,
		maxRetries: 5,
	});
	return sig;
}

// ── Metadata: upload real image + JSON to pump.fun's IPFS (no creds needed) ───
async function uploadMetadata({ name, symbol, description, website }) {
	let imageBuf = null;
	for (const url of [
		`https://opengraph.githubassets.com/1/${GITHUB_USER}/${name}`,
		`https://avatars.githubusercontent.com/u/${GITHUB_ID}?s=400&v=4`,
	]) {
		try {
			const r = await fetch(url);
			if (r.ok) {
				imageBuf = Buffer.from(await r.arrayBuffer());
				break;
			}
		} catch {
			/* try next */
		}
	}
	if (!imageBuf) throw new Error('could not fetch any coin image');

	const form = new FormData();
	form.append('file', new Blob([imageBuf], { type: 'image/png' }), 'image.png');
	form.append('name', name);
	form.append('symbol', symbol);
	form.append('description', description);
	form.append('twitter', '');
	form.append('telegram', '');
	form.append('website', website);
	form.append('showName', 'true');

	const r = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: form });
	if (!r.ok) throw new Error(`pump.fun ipfs upload failed: ${r.status} ${await r.text()}`);
	const j = await r.json();
	const uri = j.metadataUri || j.metadata_uri || j.uri;
	if (!uri) throw new Error(`pump.fun ipfs returned no metadataUri: ${JSON.stringify(j)}`);
	return uri;
}

// ── Build the coin-create instructions (creator = repo wallet, + dev buy) ────
async function buildCreateIxs({ offline, online, mint, creator, uri, name, symbol }) {
	const global = await online.fetchGlobal();
	if (DEV_BUY_SOL > 0) {
		const solAmount = new BN(lamports(DEV_BUY_SOL));
		const amount = getBuyTokenAmountFromSolAmount({
			global,
			feeConfig: null,
			mintSupply: null,
			bondingCurve: null,
			amount: solAmount,
		});
		const ixs = await offline.createV2AndBuyInstructions({
			global,
			mint,
			name,
			symbol,
			uri,
			creator,
			user: creator,
			solAmount,
			amount,
			mayhemMode: false,
		});
		return Array.isArray(ixs) ? ixs : [ixs];
	}
	const ix = await offline.createV2Instruction({
		mint,
		name,
		symbol,
		uri,
		creator,
		user: creator,
		mayhemMode: false,
	});
	return [ix];
}

// ── Build the 100%-to-GitHub fee-sharing instructions ────────────────────────
async function buildFeeShareIxs({ offline, mint, creator }) {
	const pool = canonicalPumpPoolPda(mint);
	const createCfg = await offline.createFeeSharingConfig({ creator, mint, pool });
	const update = await offline.updateFeeShares({
		authority: creator,
		mint,
		currentShareholders: [creator],
		newShareholders: [{ address: SOCIAL_PDA, shareBps: 10000 }],
	});
	return { createCfg, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// generate
// ─────────────────────────────────────────────────────────────────────────────
async function doGenerate() {
	mkdirSync(WALLET_DIR, { recursive: true });

	let repos = fetchRepos();
	if (ONLY) repos = repos.filter((r) => r.name === ONLY);
	if (LIMIT) repos = repos.slice(0, LIMIT);
	if (!repos.length) die('no repos matched');

	// Master wallet — generate once, never overwrite.
	let master;
	if (existsSync(MASTER_FILE)) {
		master = keypairFromFile(MASTER_FILE);
		log(`• master wallet exists: ${master.publicKey.toBase58()}`);
	} else {
		master = Keypair.generate();
		writeFileSync(MASTER_FILE, JSON.stringify(Array.from(master.secretKey)));
		log(`• master wallet created: ${master.publicKey.toBase58()}`);
	}

	const existing = loadJson(MANIFEST, null);
	const existingByRepo = new Map((existing?.repos || []).map((r) => [r.repo, r]));

	const usedSymbols = new Set((existing?.repos || []).map((r) => r.symbol));
	const manifestRepos = [];
	const csvLines = ['repo,symbol,name,wallet_pubkey,wallet_secret_base58'];

	for (const r of repos) {
		const prev = existingByRepo.get(r.name);
		let kp;
		let symbol;
		const walletFile = join(WALLET_DIR, `repo-${r.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
		if (prev && existsSync(walletFile)) {
			kp = keypairFromFile(walletFile);
			symbol = prev.symbol;
			usedSymbols.add(symbol);
		} else {
			kp = Keypair.generate();
			writeFileSync(walletFile, JSON.stringify(Array.from(kp.secretKey)));
			symbol = makeSymbol(r.name, usedSymbols);
		}
		const name = r.name.slice(0, 32);
		const website = `https://github.com/${GITHUB_USER}/${r.name}`;
		const description =
			`${(r.description || r.name).slice(0, 180)} — ${website}. ` +
			`Creator rewards: 100% to github.com/${GITHUB_USER}.`;
		manifestRepos.push({
			repo: r.name,
			symbol,
			name,
			description,
			website,
			walletFile: walletFile.replace(ROOT + '/', ''),
			pubkey: kp.publicKey.toBase58(),
		});
		csvLines.push(
			[r.name, symbol, JSON.stringify(name), kp.publicKey.toBase58(), bs58.encode(kp.secretKey)].join(
				',',
			),
		);
	}

	const manifest = {
		github_user: GITHUB_USER,
		github_id: GITHUB_ID,
		social_fee_pda: SOCIAL_PDA.toBase58(),
		network: NETWORK,
		dev_buy_sol: DEV_BUY_SOL,
		fund_per_wallet_sol: FUND_PER_WALLET_SOL,
		master_pubkey: master.publicKey.toBase58(),
		repo_count: manifestRepos.length,
		repos: manifestRepos,
	};
	saveJson(MANIFEST, manifest);
	writeFileSync(join(WALLET_DIR, 'wallets.csv'), csvLines.join('\n') + '\n');

	const totalFund = FUND_PER_WALLET_SOL * manifestRepos.length;
	writeFileSync(
		join(WALLET_DIR, 'README.txt'),
		[
			`pump.fun launch wallets — ${manifestRepos.length} coins for github.com/${GITHUB_USER}`,
			``,
			`Creator rewards on EVERY coin: 100% → github.com/${GITHUB_USER}`,
			`  via pump.fun social-fee escrow PDA: ${SOCIAL_PDA.toBase58()}`,
			`  (claimable by linking a Solana wallet to that GitHub identity)`,
			``,
			`MASTER WALLET (fund this one): ${master.publicKey.toBase58()}`,
			`  Fund it with ~${totalFund.toFixed(4)} SOL (plus a little for tx fees).`,
			``,
			`Files:`,
			`  master.json        master wallet secret (Solana CLI byte-array format)`,
			`  repo-<name>.json   one throwaway wallet per repo (same format)`,
			`  wallets.csv        repo, ticker, pubkey, base58 secret (Phantom import)`,
			`  manifest.json      full plan (repo → ticker → wallet → coin metadata)`,
			`  progress.json      written during fund/launch (resumable)`,
			``,
			`Import a wallet into Phantom: use the base58 secret from wallets.csv.`,
			`Import via Solana CLI: solana-keygen / use the .json byte-array directly.`,
			``,
			`NEVER commit this folder — it is gitignored. Keep the zip private.`,
		].join('\n') + '\n',
	);

	log(`\n✓ generated ${manifestRepos.length} repo wallets + master`);
	log(`  master (fund this): ${master.publicKey.toBase58()}`);
	log(`  social-fee PDA (rewards recipient): ${SOCIAL_PDA.toBase58()}`);
	log(`  fund per wallet: ${FUND_PER_WALLET_SOL} SOL  →  total ≈ ${totalFund.toFixed(4)} SOL`);
	makeZip();
}

function makeZip() {
	const res = spawnSync('zip', ['-r', '-q', ZIP_PATH, '.pump-launch-wallets'], {
		cwd: ROOT,
		encoding: 'utf8',
	});
	if (res.status !== 0) {
		log(`  (zip skipped: ${res.stderr || 'zip failed'})`);
		return;
	}
	log(`  bundle: ${ZIP_PATH.replace(ROOT + '/', '')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// status
// ─────────────────────────────────────────────────────────────────────────────
async function doStatus() {
	const manifest = loadJson(MANIFEST, null);
	if (!manifest) die('no manifest — run `generate` first');
	const progress = loadProgress();
	const connection = makeConnection();
	const master = keypairFromFile(MASTER_FILE);
	let masterBal = 0;
	try {
		masterBal = await connection.getBalance(master.publicKey);
	} catch (e) {
		log(`  (could not read master balance: ${e.message})`);
	}
	const funded = manifest.repos.filter((r) => progress[r.repo]?.funded).length;
	const launched = manifest.repos.filter((r) => progress[r.repo]?.launchSig).length;
	const shared = manifest.repos.filter((r) => progress[r.repo]?.feeShareSig).length;
	log(`network:        ${NETWORK}  (rpc: ${RPC_URL})`);
	log(`master:         ${master.publicKey.toBase58()}  balance ${sol(masterBal)} SOL`);
	log(`rewards → :     github.com/${GITHUB_USER}  (PDA ${manifest.social_fee_pda})`);
	log(`repos:          ${manifest.repos.length}`);
	log(`funded:         ${funded}/${manifest.repos.length}`);
	log(`launched:       ${launched}/${manifest.repos.length}`);
	log(`fee-share set:  ${shared}/${manifest.repos.length}`);
	const remaining = manifest.repos.length - launched;
	log(
		`est. SOL to finish: ~${(remaining * FUND_PER_WALLET_SOL).toFixed(4)} (funding) ` +
			`— master needs that available`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// preflight — prove the pipeline for one repo without sending anything
// ─────────────────────────────────────────────────────────────────────────────
async function doPreflight() {
	const manifest = loadJson(MANIFEST, null);
	if (!manifest) die('no manifest — run `generate` first');
	const entry = ONLY
		? manifest.repos.find((r) => r.repo === ONLY)
		: manifest.repos[0];
	if (!entry) die('repo not found in manifest');

	log(`preflight for "${entry.repo}" (ticker ${entry.symbol}) on ${NETWORK}`);
	const connection = makeConnection();
	const { offline, online } = makeSdk(connection);
	const creator = keypairFromFile(join(ROOT, entry.walletFile)).publicKey;
	const mint = Keypair.generate();

	log('• uploading real metadata to pump.fun IPFS…');
	const uri = await uploadMetadata({
		name: entry.name,
		symbol: entry.symbol,
		description: entry.description,
		website: entry.website,
	});
	log(`  metadata uri: ${uri}`);

	log('• building create + dev-buy instructions…');
	const createIxs = await buildCreateIxs({
		offline,
		online,
		mint: mint.publicKey,
		creator,
		uri,
		name: entry.name,
		symbol: entry.symbol,
	});
	log(`  create instructions: ${createIxs.length}`);

	log('• building 100%-to-GitHub fee-share instructions…');
	const { createCfg, update } = await buildFeeShareIxs({ offline, mint: mint.publicKey, creator });
	log(`  fee-sharing config PDA: ${feeSharingConfigPda(mint.publicKey).toBase58()}`);
	log(`  shareholder (100%):     ${SOCIAL_PDA.toBase58()}  (= github.com/${GITHUB_USER})`);
	log(`  createFeeSharingConfig keys: ${createCfg.keys.length}, updateFeeShares keys: ${update.keys.length}`);

	log('\n✓ preflight OK — metadata pinned, all instructions built. No tx sent.');
	log('  Fund the master wallet, then run: `node scripts/pump-launch-repos.mjs run`');
}

// ─────────────────────────────────────────────────────────────────────────────
// fund — master → each unfunded repo wallet
// ─────────────────────────────────────────────────────────────────────────────
async function doFund() {
	const manifest = loadJson(MANIFEST, null);
	if (!manifest) die('no manifest — run `generate` first');
	const connection = makeConnection();
	const master = keypairFromFile(MASTER_FILE);
	const progress = loadProgress();

	let targets = manifest.repos.filter((r) => !progress[r.repo]?.funded);
	if (ONLY) targets = targets.filter((r) => r.repo === ONLY);
	if (!targets.length) return log('✓ all repo wallets already funded');

	const need = lamports(FUND_PER_WALLET_SOL) * targets.length;
	const bal = await connection.getBalance(master.publicKey);
	log(`master ${master.publicKey.toBase58()} balance ${sol(bal)} SOL`);
	log(`funding ${targets.length} wallets × ${FUND_PER_WALLET_SOL} SOL = ${sol(need)} SOL`);
	if (bal < need) die(`master underfunded: has ${sol(bal)} SOL, needs ${sol(need)} SOL`);
	if (!(await confirm(`Send ${sol(need)} SOL from master to ${targets.length} wallets?`)))
		return log('aborted');

	for (const r of targets) {
		const dest = new PublicKey(r.pubkey);
		try {
			const ix = SystemProgram.transfer({
				fromPubkey: master.publicKey,
				toPubkey: dest,
				lamports: lamports(FUND_PER_WALLET_SOL),
			});
			const sig = await sendTx(connection, [ix], master);
			progress[r.repo] = { ...(progress[r.repo] || {}), funded: true, fundSig: sig };
			saveProgress(progress);
			log(`  ✓ ${r.repo.padEnd(28)} ${sol(lamports(FUND_PER_WALLET_SOL))} SOL  ${sig.slice(0, 8)}…`);
		} catch (e) {
			log(`  ✗ ${r.repo.padEnd(28)} fund failed: ${e.message}`);
		}
		await sleep(250);
	}
	log('✓ funding pass complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// launch — per repo wallet: create coin, then set 100% fee-share → GitHub
// ─────────────────────────────────────────────────────────────────────────────
async function doLaunch() {
	const manifest = loadJson(MANIFEST, null);
	if (!manifest) die('no manifest — run `generate` first');
	const connection = makeConnection();
	const { offline, online } = makeSdk(connection);
	const master = keypairFromFile(MASTER_FILE);
	const progress = loadProgress();

	// One-time: ensure the GitHub social-fee escrow PDA exists (master pays rent).
	await ensureSocialPda(connection, offline, master, progress);

	let targets = manifest.repos.filter((r) => progress[r.repo]?.funded && !progress[r.repo]?.feeShareSig);
	if (ONLY) targets = targets.filter((r) => r.repo === ONLY);
	if (!targets.length) return log('✓ nothing to launch (fund first, or all done)');

	log(`launching ${targets.length} coins on ${NETWORK}, rewards → github.com/${GITHUB_USER}`);
	if (!(await confirm(`Launch ${targets.length} coins now? This spends real SOL and is irreversible.`)))
		return log('aborted');

	for (const r of targets) {
		const st = progress[r.repo] || {};
		const wallet = keypairFromFile(join(ROOT, r.walletFile));
		try {
			// 1. Create the coin (+ dev buy) if not already created.
			if (!st.launchSig) {
				const uri = st.uri || (await uploadMetadata(r));
				st.uri = uri;
				const mint = st.mintSecret ? Keypair.fromSecretKey(Uint8Array.from(st.mintSecret)) : Keypair.generate();
				st.mint = mint.publicKey.toBase58();
				st.mintSecret = Array.from(mint.secretKey);
				progress[r.repo] = st;
				saveProgress(progress);
				const createIxs = await buildCreateIxs({
					offline,
					online,
					mint: mint.publicKey,
					creator: wallet.publicKey,
					uri,
					name: r.name,
					symbol: r.symbol,
				});
				st.launchSig = await sendTx(connection, createIxs, wallet, [mint]);
				progress[r.repo] = st;
				saveProgress(progress);
				log(`  ✓ ${r.repo.padEnd(28)} mint ${st.mint.slice(0, 6)}…  ${explorer(st.launchSig)}`);
			}

			// 2. Create the fee-sharing config (creator = wallet, seeded at 100%).
			const mintPk = new PublicKey(st.mint);
			if (!st.feeCfgSig) {
				const pool = canonicalPumpPoolPda(mintPk);
				const ix = await offline.createFeeSharingConfig({ creator: wallet.publicKey, mint: mintPk, pool });
				st.feeCfgSig = await sendTx(connection, [ix], wallet);
				progress[r.repo] = st;
				saveProgress(progress);
			}

			// 3. Move 100% of the split to the GitHub social-fee PDA (0% to wallet).
			if (!st.feeShareSig) {
				const ix = await offline.updateFeeShares({
					authority: wallet.publicKey,
					mint: mintPk,
					currentShareholders: [wallet.publicKey],
					newShareholders: [{ address: SOCIAL_PDA, shareBps: 10000 }],
				});
				st.feeShareSig = await sendTx(connection, [ix], wallet);
				progress[r.repo] = st;
				saveProgress(progress);
				log(`     ↳ rewards 100% → github.com/${GITHUB_USER}  ${st.feeShareSig.slice(0, 8)}…`);
			}
		} catch (e) {
			log(`  ✗ ${r.repo.padEnd(28)} ${e.message}`);
		}
		await sleep(400);
	}
	log('✓ launch pass complete — run `status` for the tally');
}

async function ensureSocialPda(connection, offline, master, progress) {
	if (progress.__socialPda?.created) return;
	const info = await connection.getAccountInfo(SOCIAL_PDA).catch(() => null);
	if (info) {
		progress.__socialPda = { created: true, note: 'already existed' };
		saveProgress(progress);
		return;
	}
	try {
		const ix = await offline.createSocialFeePda({
			payer: master.publicKey,
			userId: GITHUB_ID,
			platform: PLATFORM_GITHUB,
		});
		const sig = await sendTx(connection, Array.isArray(ix) ? ix : [ix], master);
		progress.__socialPda = { created: true, sig };
		saveProgress(progress);
		log(`• initialized GitHub social-fee escrow PDA  ${sig.slice(0, 8)}…`);
	} catch (e) {
		// Non-fatal: updateFeeShares can still name the PDA; the escrow inits on
		// first claim. Log and continue.
		log(`• social-fee PDA init skipped (${e.message}) — fees still route to ${SOCIAL_PDA.toBase58()}`);
		progress.__socialPda = { created: false, error: e.message };
		saveProgress(progress);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
function help() {
	log(
		[
			'pump-launch-repos — one pump.fun coin per public repo, rewards → a GitHub user',
			'',
			'Usage: node scripts/pump-launch-repos.mjs <command> [flags]',
			'',
			'Commands:',
			'  generate    create master + per-repo wallets, manifest, csv, zip',
			'  status      funding + launch progress',
			'  preflight   upload metadata + build (not send) ixs for one repo',
			'  fund        master → each unfunded repo wallet',
			'  launch      create coin + set 100% fee-share → GitHub, per repo',
			'  run         fund, then launch',
			'',
			'Key flags: --network mainnet|devnet  --rpc <url>  --dev-buy 0.0001',
			'           --fund-per-wallet 0.04  --limit N  --only <repo>  --yes',
		].join('\n'),
	);
}

async function main() {
	switch (cmd) {
		case 'generate':
			return doGenerate();
		case 'status':
			return doStatus();
		case 'preflight':
			return doPreflight();
		case 'fund':
			return doFund();
		case 'launch':
			return doLaunch();
		case 'run':
			await doFund();
			return doLaunch();
		default:
			return help();
	}
}

main().catch((e) => die(e.stack || e.message));
