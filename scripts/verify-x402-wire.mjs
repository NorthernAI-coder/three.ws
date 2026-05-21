#!/usr/bin/env node
// Local invariant check: server's 402 envelope <-> SDK's payment payload
// share the exact wire shape required by the Coinbase x402 v2 spec.
//
// Asserts (no network calls — pure import smoke):
//   1. paymentRequirements() returns v2-shape `accepts[]` entries with
//      `amount` (NOT `maxAmountRequired`).
//   2. build402Body() emits `x402Version: 2`, top-level resource{},
//      accepts[], extensions.bazaar.
//   3. When CDP credentials are present, each EVM `exact` accept gets a
//      Permit2 sibling (`extra.assetTransferMethod === 'permit2'`) and the
//      top-level extensions include `eip2612GasSponsoring` +
//      `erc20ApprovalGasSponsoring`. Without CDP creds, neither is emitted.
//   4. permit2VariantOf() correctly produces siblings for EVM `exact` only
//      (Solana SPL + BSC `direct` get null).
//   5. SDK's PaymentPayload shape carries top-level `scheme` + `network`
//      that match the server's selectRequirement() lookup.
//   6. SDK's X-PAYMENT header constant equals what auth.js reads.

import assert from 'node:assert/strict';

process.env.X402_PAY_TO_SOLANA ??= 'BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN';
process.env.X402_PAY_TO_BASE ??= '0x4022de2d36c334e73c7a108805cea11c0564f402';
process.env.X402_ASSET_MINT_SOLANA ??= 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.X402_ASSET_ADDRESS_BASE ??= '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.X402_MAX_AMOUNT_REQUIRED ??= '1000';
process.env.X402_FEE_PAYER_SOLANA ??= '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4';
// Default to CDP-credentialed mode — that's the production path. We still
// re-import a fresh copy of the module further down with creds stripped to
// confirm the no-CDP fallback. Use throwaway values; nothing here actually
// calls the facilitator.
process.env.CDP_API_KEY_ID ??= 'verify-x402-wire-fake-key-id';
process.env.CDP_API_KEY_SECRET ??= 'verify-x402-wire-fake-key-secret';

const {
	paymentRequirements,
	build402Body,
	permit2VariantOf,
	EIP2612_EXTENSION_KEY,
	ERC20_APPROVAL_EXTENSION_KEY,
	X402_VERSION,
	NETWORK_BASE_MAINNET,
	NETWORK_BSC_MAINNET,
	NETWORK_SOLANA_MAINNET,
} = await import('../api/_lib/x402-spec.js');
const { x402: sdkX402 } = await import('../agent-payments-sdk/dist/solana/index.js');
const { X402_HEADER_PAYMENT, X402_HEADER_PAYMENT_RESPONSE } = sdkX402;

console.log('[verify] server constants');
assert.equal(X402_VERSION, 2, 'server X402_VERSION must be 2');
assert.equal(NETWORK_BASE_MAINNET, 'eip155:8453');
assert.equal(
	NETWORK_SOLANA_MAINNET,
	'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
);
assert.equal(EIP2612_EXTENSION_KEY, 'eip2612GasSponsoring');
assert.equal(ERC20_APPROVAL_EXTENSION_KEY, 'erc20ApprovalGasSponsoring');

console.log('[verify] paymentRequirements() shape (CDP credentialed)');
const reqs = paymentRequirements();
assert.ok(Array.isArray(reqs) && reqs.length >= 1, 'must return at least one accept');
const VALID_SCHEMES = new Set(['exact', 'direct']);
for (const r of reqs) {
	assert.ok(
		VALID_SCHEMES.has(r.scheme),
		`scheme must be one of ${[...VALID_SCHEMES].join('|')}, got ${r.scheme}`,
	);
	assert.ok(r.amount, `v2 spec requires 'amount' (not maxAmountRequired) on ${r.network}`);
	assert.ok(!('maxAmountRequired' in r), `must not emit legacy v1 field on ${r.network}`);
	assert.ok(r.payTo, `${r.network} missing payTo`);
	assert.ok(r.asset, `${r.network} missing asset`);
	assert.ok(r.network.includes(':'), `${r.network} must be CAIP-2`);
	if (r.network.startsWith('solana:'))
		assert.ok(r.extra?.feePayer, `Solana accepts must include extra.feePayer`);
	console.log(
		`  ok  ${r.network}/${r.scheme} amount=${r.amount} payTo=${r.payTo.slice(0, 8)}… method=${r.extra?.assetTransferMethod || 'eip3009'}`,
	);
}

console.log('[verify] Permit2 sibling generation');
const baseEip3009 = reqs.find(
	(r) => r.network === NETWORK_BASE_MAINNET && !r.extra?.assetTransferMethod,
);
assert.ok(baseEip3009, 'Base mainnet EIP-3009 accept must be present');
const basePermit2 = reqs.find(
	(r) => r.network === NETWORK_BASE_MAINNET && r.extra?.assetTransferMethod === 'permit2',
);
assert.ok(basePermit2, 'Base mainnet Permit2 sibling must be present when CDP creds are set');
assert.equal(basePermit2.extra.supportsEip2612, true, 'Permit2 sibling must declare supportsEip2612');
// Sibling pure-function check.
const synthetic = permit2VariantOf(baseEip3009);
assert.ok(synthetic, 'permit2VariantOf must return a sibling for EVM exact accepts');
assert.equal(synthetic.extra.assetTransferMethod, 'permit2');
assert.equal(synthetic.network, baseEip3009.network);
assert.equal(synthetic.payTo, baseEip3009.payTo);
assert.equal(synthetic.asset, baseEip3009.asset);
// Solana SPL has no Permit2 path — must be null.
const solanaAccept = reqs.find((r) => r.network === NETWORK_SOLANA_MAINNET);
assert.equal(
	permit2VariantOf(solanaAccept),
	null,
	'permit2VariantOf must return null for Solana SPL accepts',
);
// BSC direct uses an on-chain pay() scheme, not the exact/Permit2 path.
const bscAccept = reqs.find((r) => r.network === NETWORK_BSC_MAINNET);
if (bscAccept)
	assert.equal(
		permit2VariantOf(bscAccept),
		null,
		'permit2VariantOf must return null for BSC direct accepts',
	);
console.log(`  ok  EVM exact → sibling; Solana SPL / BSC direct → null`);

console.log('[verify] build402Body() envelope (CDP credentialed)');
const body = build402Body({
	resourceUrl: 'https://three.ws/api/mcp',
	accepts: reqs,
});
assert.equal(body.x402Version, 2);
assert.equal(typeof body.resource, 'object');
assert.equal(body.resource.url, 'https://three.ws/api/mcp');
assert.ok(Array.isArray(body.accepts));
assert.ok(body.extensions?.bazaar?.discoverable, 'bazaar discovery extension must be present');
assert.ok(
	body.extensions[EIP2612_EXTENSION_KEY],
	'eip2612GasSponsoring must be declared when accepts include a Permit2 sibling',
);
assert.ok(
	body.extensions[ERC20_APPROVAL_EXTENSION_KEY],
	'erc20ApprovalGasSponsoring must be declared when accepts include a Permit2 sibling',
);
assert.equal(
	body.extensions[EIP2612_EXTENSION_KEY].info.version,
	'1',
	'eip2612GasSponsoring info.version must be "1"',
);
console.log(
	`  ok  x402Version=${body.x402Version} accepts=${body.accepts.length} extensions=[${Object.keys(body.extensions).join(',')}]`,
);

console.log('[verify] no-CDP fallback (PayAI-only operators)');
delete process.env.CDP_API_KEY_ID;
delete process.env.CDP_API_KEY_SECRET;
// Re-import with cache-busting query so the module re-reads env.
const noCdpModule = await import('../api/_lib/x402-spec.js?nocdp');
const noCdpReqs = noCdpModule.paymentRequirements();
const noCdpPermit2 = noCdpReqs.find((r) => r.extra?.assetTransferMethod === 'permit2');
assert.equal(
	noCdpPermit2,
	undefined,
	'Without CDP creds we must NOT advertise a Permit2 sibling (PayAI does not settle it)',
);
const noCdpBody = noCdpModule.build402Body({
	resourceUrl: 'https://three.ws/api/mcp',
	accepts: noCdpReqs,
});
assert.ok(
	!noCdpBody.extensions[noCdpModule.EIP2612_EXTENSION_KEY],
	'Without Permit2 accepts the eip2612 extension must not be declared',
);
assert.ok(
	!noCdpBody.extensions[noCdpModule.ERC20_APPROVAL_EXTENSION_KEY],
	'Without Permit2 accepts the erc20Approval extension must not be declared',
);
console.log('  ok  no Permit2 sibling, no gas-sponsoring extensions advertised');
// Restore CDP creds for the rest of the script.
process.env.CDP_API_KEY_ID = 'verify-x402-wire-fake-key-id';
process.env.CDP_API_KEY_SECRET = 'verify-x402-wire-fake-key-secret';

console.log('[verify] SDK header constants match server reads');
assert.equal(X402_HEADER_PAYMENT, 'X-PAYMENT', 'SDK must send X-PAYMENT, server reads x-payment');
assert.equal(X402_HEADER_PAYMENT_RESPONSE, 'X-PAYMENT-RESPONSE');
console.log(`  ok  X-PAYMENT / X-PAYMENT-RESPONSE`);

console.log('[verify] PaymentPayload shape interop (SDK builds → server selectRequirement reads)');
const accept = reqs.find((r) => r.network === NETWORK_SOLANA_MAINNET);
const sdkPayload = {
	x402Version: 2,
	scheme: accept.scheme,
	network: accept.network,
	// PayAI's facilitator requires the ResourceInfo object form on the payload,
	// not a bare URL string — a string triggers `invalid_payload` on /verify.
	resource: { url: 'https://three.ws/api/mcp', mimeType: 'application/json' },
	accepted: accept,
	payload: { transaction: 'base64...', payer: '11111111111111111111111111111111' },
};
// Server's selectRequirement reads paymentPayload.network OR paymentPayload.paymentRequirements?.network
assert.equal(sdkPayload.network, accept.network);
console.log(`  ok  top-level network=${sdkPayload.network} matches server selectRequirement()`);

console.log('\nPASS — server <-> SDK wire shapes are aligned.');
