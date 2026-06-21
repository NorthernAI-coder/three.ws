#!/usr/bin/env node
// Preflight: load the throwaway keypair, print its address + on-chain balances,
// and report whether it holds enough to run the e2e tests. Spends nothing.
//
//   node scripts/x402-modal/preflight.mjs

import { loadBuyer, connection, readBalances, fmt, RPC_URL } from './_lib.mjs';

// Conservative minimums for a full run (USDC live call + a few local THREE/USDC
// self-transfers where the buyer also pays SOL fees + any one-time ATA rent).
const MIN_SOL = 0.01;   // local self-transfers pay their own fee + possible ATA rent
const MIN_USDC = 0.05;  // live /api/mcp is $0.001/call; plenty of headroom
const MIN_THREE = 5;    // local THREE self-transfer test amount, with headroom

const buyer = loadBuyer();
const conn = connection();

console.log('x402 modal test — preflight');
console.log('  RPC    :', RPC_URL);
console.log('  buyer  :', buyer.publicKey.toBase58());

const b = await readBalances(conn, buyer.publicKey);
console.log('');
console.log('  SOL    :', fmt(b.sol, 9), b.sol >= MIN_SOL ? 'OK' : `LOW (need ~${MIN_SOL})`);
console.log('  USDC   :', fmt(b.usdc.ui), b.usdc.exists === false ? '(no ATA)' : '', b.usdc.ui >= MIN_USDC ? 'OK' : `LOW (need ~${MIN_USDC})`);
console.log('  THREE  :', fmt(b.three.ui), b.three.exists === false ? '(no ATA)' : '', b.three.ui >= MIN_THREE ? 'OK' : `LOW (need ~${MIN_THREE})`);
console.log('');
console.log('  USDC ATA :', b.usdc.ata);
console.log('  THREE ATA:', b.three.ata);

const ready = b.sol >= MIN_SOL && b.usdc.ui >= MIN_USDC && b.three.ui >= MIN_THREE;
console.log('');
console.log(ready ? '✓ Funded and ready for full e2e.' : '… Fund the address above, then re-run preflight.');
process.exit(ready ? 0 : 1);
