#!/usr/bin/env node
// scripts/siwx-verify-agent.mjs
//
// End-to-end SIWX verification for the agent path. Drives a real /api/x402/*
// endpoint through the same flow @x402/fetch + @x402/extensions/sign-in-with-x
// give every shopping bot: pay once with X-PAYMENT, then re-enter for free
// with SIGN-IN-WITH-X.
//
// Required env:
//   EVM_PRIVATE_KEY   — 0x-prefixed funded wallet on Base mainnet (with USDC)
//   X402_RESOURCE     — full URL of a SIWX-enabled paid endpoint
//
// Optional env:
//   SIWX_VERIFY_MODE  — 'full' (default) | 'siwx-only' | 'pay-only'
//                       Scenario D (negative path) uses 'siwx-only' with a
//                       fresh / unfunded wallet so we exercise the
//                       402 siwx_not_paid branch directly.
//
// Output:
//   ~/.claude/siwx-verify/agent-result.json  — JSON artifact with timestamps,
//   recovered addresses, response status codes, and the on-chain transaction
//   hash (from X-PAYMENT-RESPONSE) when the pay leg ran.

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment } from '@x402/fetch';
import { wrapFetchWithSIWx } from '@x402/extensions/sign-in-with-x';

const MODE = process.env.SIWX_VERIFY_MODE || 'full';
const PK = process.env.EVM_PRIVATE_KEY;
const URL = process.env.X402_RESOURCE;

if (!PK) {
	console.error('EVM_PRIVATE_KEY required (0x-prefixed)');
	process.exit(2);
}
if (!URL) {
	console.error('X402_RESOURCE required (full URL of SIWX-enabled endpoint)');
	process.exit(2);
}

const signer = privateKeyToAccount(PK);
const result = {
	ranAt: new Date().toISOString(),
	mode: MODE,
	url: URL,
	address: signer.address,
	pay: null,
	siwx: null,
	pass: false,
};

function decodePaymentResponseHeader(value) {
	if (!value) return null;
	try {
		return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
	} catch {
		return null;
	}
}

async function readBody(res) {
	const text = await res.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

// ── Leg 1 — pay with X-PAYMENT ─────────────────────────────────────────────
if (MODE === 'full' || MODE === 'pay-only') {
	const fetchWithPayment = wrapFetchWithPayment(fetch, signer);
	const t0 = Date.now();
	const r1 = await fetchWithPayment(URL);
	const elapsed = Date.now() - t0;
	const body = await readBody(r1);
	result.pay = {
		status: r1.status,
		elapsedMs: elapsed,
		paymentResponse: decodePaymentResponseHeader(r1.headers.get('x-payment-response')),
		body,
	};
	if (r1.status !== 200) {
		await persist();
		throw new Error(`pay leg failed: HTTP ${r1.status} ${JSON.stringify(body)?.slice(0, 200)}`);
	}
}

// ── Leg 2 — SIWX retry ─────────────────────────────────────────────────────
if (MODE === 'full' || MODE === 'siwx-only') {
	const fetchWithSiwx = wrapFetchWithSIWx(fetch, signer);
	const t2 = Date.now();
	const r2 = await fetchWithSiwx(URL);
	const elapsed = Date.now() - t2;
	const body = await readBody(r2);
	result.siwx = {
		status: r2.status,
		elapsedMs: elapsed,
		recoveredAddress: r2.headers.get('x-siwx-address') || null,
		body,
	};
	if (MODE === 'siwx-only') {
		// Negative-path / Scenario D: we EXPECT a 402 siwx_not_paid.
		if (r2.status === 402 && (body?.error === 'siwx_not_paid' || /siwx_not_paid/.test(JSON.stringify(body) || ''))) {
			result.pass = true;
		} else if (r2.status === 200) {
			result.pass = false;
			result.error = 'siwx-only mode unexpectedly returned 200 — this wallet already has a grant';
		} else {
			result.pass = false;
			result.error = `siwx-only mode expected 402 siwx_not_paid, got ${r2.status}`;
		}
	} else if (r2.status !== 200) {
		await persist();
		throw new Error(`siwx leg failed: HTTP ${r2.status} ${JSON.stringify(body)?.slice(0, 200)}`);
	} else {
		result.pass = true;
	}
}

if (MODE === 'pay-only') {
	result.pass = result.pay?.status === 200;
}

await persist();
console.log(`OK — wrote ${await outputPath()}`);

async function outputPath() {
	return join(homedir(), '.claude/siwx-verify/agent-result.json');
}

async function persist() {
	const outDir = join(homedir(), '.claude/siwx-verify');
	await mkdir(outDir, { recursive: true });
	await writeFile(await outputPath(), JSON.stringify(result, null, 2));
}
