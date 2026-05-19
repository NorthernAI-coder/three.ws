// Live mainnet verification of every V2 / USDC code path our backend depends
// on. Reads real on-chain state (Global, BondingCurve) and builds real
// transactions — but never submits, so no funds move and no keys are needed.
//
// Why mainnet and not devnet: the May 21, 2026 USDC launch ships on mainnet
// first; the pump.fun program/state we ship against lives there. Devnet has
// stale program versions for parts of the v2 surface, so it's not a faithful
// smoke target.
//
// Env:
//   SOLANA_RPC_URL — preferred (paid Helius/Triton/etc). Falls back to public
//                    mainnet-beta if unset (rate-limited but works for a few
//                    reads).
//   PUMP_SMOKE_MINT — pump.fun mint to use as the read target. Defaults to a
//                     known live SOL-paired coin pulled from the v3 frontend
//                     API at write time; override with any current mint.
//
// Run: node scripts/pump-v2-smoke.mjs

import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js';
import {
	PumpSdk,
	OnlinePumpSdk,
	isLegacyQuoteMint,
	canonicalPumpPoolPda,
	canonicalPumpPoolPdaWithQuote,
	getBuyTokenAmountFromSolAmount,
} from '@pump-fun/pump-sdk';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const WSOL         = new PublicKey('So11111111111111111111111111111111111111112');

// A live mainnet pump.fun coin to exercise real bonding-curve reads against.
// Override with PUMP_SMOKE_MINT when this one graduates / 404s.
const TARGET_MINT_STR = process.env.PUMP_SMOKE_MINT
	|| 'BD1Soa3PKTkcJkGtn14d7jLy4dUiztwo6tP2KkqJpump';

console.log(`RPC:    ${RPC}`);
console.log(`Mint:   ${TARGET_MINT_STR}`);
console.log('');

const connection = new Connection(RPC, 'confirmed');
const offline    = new PumpSdk();
const online     = new OnlinePumpSdk(connection);

const targetMint = new PublicKey(TARGET_MINT_STR);
const fakeUser   = Keypair.generate().publicKey;
const creator    = Keypair.generate().publicKey;
const wallet1    = Keypair.generate().publicKey;
const wallet2    = Keypair.generate().publicKey;

const results = [];
async function check(name, fn) {
	const started = Date.now();
	try {
		const v = await fn();
		results.push({ name, ok: true, detail: summarize(v), ms: Date.now() - started });
	} catch (err) {
		results.push({ name, ok: false, err: err?.message || String(err), ms: Date.now() - started });
	}
}
function summarize(v) {
	if (Array.isArray(v)) return `${v.length} instruction${v.length === 1 ? '' : 's'}`;
	if (v?.keys && Array.isArray(v.keys)) return `1 ix (${v.keys.length} accounts)`;
	if (v?.toBase58) return v.toBase58();
	if (typeof v === 'boolean') return String(v);
	if (v && typeof v === 'object' && 'mint' in v) return Object.keys(v).join(',');
	return typeof v;
}

// ── Offline helpers (no RPC) ────────────────────────────────────────────────

await check('isLegacyQuoteMint(WSOL) === true', () => {
	if (!isLegacyQuoteMint(WSOL)) throw new Error('expected WSOL to be legacy');
	return true;
});
await check('isLegacyQuoteMint(USDC) === false', () => {
	if (isLegacyQuoteMint(USDC_MAINNET)) throw new Error('expected USDC to be non-legacy');
	return true;
});
await check('canonicalPumpPoolPda(mint) — SOL', () => canonicalPumpPoolPda(targetMint));
await check('canonicalPumpPoolPdaWithQuote(mint, USDC)', () =>
	canonicalPumpPoolPdaWithQuote(targetMint, USDC_MAINNET),
);

// ── Live mainnet reads ──────────────────────────────────────────────────────

let global = null;
await check('OnlinePumpSdk.fetchGlobal() — mainnet', async () => {
	global = await online.fetchGlobal();
	if (!global) throw new Error('null global');
	return global;
});

let buyState = null;
await check(`OnlinePumpSdk.fetchBuyState(${TARGET_MINT_STR.slice(0, 6)}…)`, async () => {
	buyState = await online.fetchBuyState(targetMint, fakeUser);
	if (!buyState?.bondingCurve) throw new Error('no bonding curve returned');
	return buyState;
});

// ── Real V1 buy ix against fetched state (SOL-paired, current behaviour) ───

await check('buyInstructions (SOL, 0.01 SOL in)', async () => {
	if (!buyState || !global) throw new Error('prerequisite fetch missing');
	const solLamports = new BN(Math.floor(0.01 * 1_000_000_000));
	const expected = getBuyTokenAmountFromSolAmount({
		global,
		feeConfig: null,
		mintSupply: buyState.bondingCurve.tokenTotalSupply,
		bondingCurve: buyState.bondingCurve,
		amount: solLamports,
	});
	return offline.buyInstructions({
		global,
		bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
		bondingCurve: buyState.bondingCurve,
		associatedUserAccountInfo: buyState.associatedUserAccountInfo,
		mint: targetMint,
		user: fakeUser,
		amount: expected,
		solAmount: solLamports,
		slippage: 0.01,
	});
});

// ── Real V2 buy ix with USDC quote (post-launch path; pre-launch the program
//    will reject on submit, but the SDK must still build the tx so our handler
//    surface is provably correct the moment USDC flips live on Thursday.) ──

await check('buyV2Instructions (USDC quote, 1 USDC in)', async () => {
	if (!buyState || !global) throw new Error('prerequisite fetch missing');
	return offline.buyV2Instructions({
		global,
		bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
		bondingCurve: buyState.bondingCurve,
		associatedUserAccountInfo: buyState.associatedUserAccountInfo,
		mint: targetMint,
		user: fakeUser,
		amount: new BN(0),
		quoteAmount: new BN(1_000_000), // 1 USDC (6 dec)
		slippage: 0.01,
		quoteMint: USDC_MAINNET,
	});
});

// ── V2 sell ix with USDC quote ─────────────────────────────────────────────

await check('sellV2Instructions (USDC quote)', async () => {
	if (!buyState || !global) throw new Error('prerequisite fetch missing');
	// fetchSellState requires a real user ATA to exist on-chain. The seller
	// surface we exercise here is the offline ix builder, which only needs
	// the bonding-curve state — that's already in `buyState`. Skipping the
	// fetchSellState round-trip avoids needing a funded test holder.
	return offline.sellV2Instructions({
		global,
		bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
		bondingCurve: buyState.bondingCurve,
		mint: targetMint,
		user: fakeUser,
		amount: new BN(1_000_000_000),
		quoteAmount: new BN(0),
		slippage: 0.01,
		quoteMint: USDC_MAINNET,
	});
});

// ── createV2Instruction + USDC (launch path, no initial buy) ───────────────

const launchMint = Keypair.generate().publicKey;
await check('createV2Instruction (USDC launch, no buy)', () =>
	offline.createV2Instruction({
		mint: launchMint,
		name: 'SmokeTest',
		symbol: 'SMK',
		uri: 'https://example.com/m.json',
		creator,
		user: fakeUser,
		mayhemMode: false,
		quoteMint: USDC_MAINNET,
	}),
);

// ── createV2AndBuyV2Instructions + USDC (launch with USDC initial buy) ─────

await check('createV2AndBuyV2Instructions (USDC, 5 USDC initial buy)', async () => {
	if (!global) throw new Error('prerequisite fetch missing');
	const quoteAmount = new BN(5_000_000); // 5 USDC
	const tokenAmount = getBuyTokenAmountFromSolAmount({
		global,
		feeConfig: null,
		mintSupply: null,
		bondingCurve: null,
		amount: quoteAmount,
	});
	return offline.createV2AndBuyV2Instructions({
		global,
		mint: Keypair.generate().publicKey,
		name: 'SmokeTest',
		symbol: 'SMK',
		uri: 'https://example.com/m.json',
		creator,
		user: fakeUser,
		quoteAmount,
		amount: tokenAmount,
		mayhemMode: false,
		quoteMint: USDC_MAINNET,
	});
});

// ── Fee-sharing lifecycle on mainnet PDAs ──────────────────────────────────

await check('createFeeSharingConfig (USDC pool)', () =>
	offline.createFeeSharingConfig({
		creator,
		mint: targetMint,
		pool: canonicalPumpPoolPdaWithQuote(targetMint, USDC_MAINNET),
	}),
);
await check('updateFeeShares (2 shareholders, 60/40)', () =>
	offline.updateFeeShares({
		authority: creator,
		mint: targetMint,
		currentShareholders: [creator],
		newShareholders: [
			{ address: wallet1, shareBps: 6_000 },
			{ address: wallet2, shareBps: 4_000 },
		],
	}),
);

// OnlinePumpSdk method presence — these need the right Solana program state to
// run end-to-end, but the constructor + method binding are what our handlers
// rely on, so a presence check is the right scope here.
await check('OnlinePumpSdk.collectCoinCreatorFeeInstructions exists', () => {
	if (typeof online.collectCoinCreatorFeeInstructions !== 'function')
		throw new Error('method missing');
	return true;
});
await check('OnlinePumpSdk.buildDistributeCreatorFeesInstructions exists', () => {
	if (typeof online.buildDistributeCreatorFeesInstructions !== 'function')
		throw new Error('method missing');
	return true;
});

// ── Report ──────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
let pass = 0, fail = 0;
console.log('Pump.fun V2 / USDC mainnet smoke results');
console.log('─'.repeat(80));
for (const r of results) {
	if (r.ok) {
		pass++;
		console.log(`  PASS  ${pad(r.name, 56)} ${pad(r.detail, 14)} ${r.ms}ms`);
	} else {
		fail++;
		console.log(`  FAIL  ${pad(r.name, 56)} ${r.err}`);
	}
}
console.log('─'.repeat(80));
console.log(`  ${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
