// x402 EVM Permit2 helpers — adds a Permit2-flavored acceptance entry and
// advertises the gas-sponsoring extensions that let buyers pay USDC (or any
// ERC-20 we choose to accept) without holding native gas.
//
// Why both extensions:
//   • EIP-2612 gas sponsoring — preferred path for tokens that implement
//     EIP-2612 (Base USDC v2 does). Client signs an off-chain permit; the
//     CDP facilitator submits it on-chain via x402ExactPermit2Proxy.settleWithPermit
//     in the same batch as the Permit2 transfer.
//   • ERC-20 approval gas sponsoring — universal fallback for any other
//     ERC-20. Client signs (but does not broadcast) a raw approve(Permit2,
//     MaxUint256) tx; the facilitator broadcasts it atomically before
//     calling x402ExactPermit2Proxy.settle.
//
// Both are server-side ADVERTISEMENTS only. Whether they actually fire
// depends on the facilitator we route Base traffic to. CDP supports both
// today; PayAI does not (it only settles EIP-3009). When the resource server
// uses CDP (CDP_API_KEY_ID + CDP_API_KEY_SECRET set), advertise. Otherwise
// keep the 402 body to EIP-3009 only so we don't promise capabilities the
// facilitator won't honor.
//
// We keep the existing EIP-3009 acceptance entry as the FIRST item in
// `accepts[]` so default clients (including our drop-in modal at
// public/x402.js) continue using the simpler gasless EIP-3009 flow. The
// Permit2 entry is appended as a secondary option for agentic clients using
// @x402/evm's ExactEvmScheme, which auto-routes to Permit2 when the
// `assetTransferMethod` extra is present.

import {
	declareEip2612GasSponsoringExtension,
	declareErc20ApprovalGasSponsoringExtension,
} from '@x402/extensions';

import { env } from './env.js';
import { NETWORK_BASE_MAINNET } from './x402-spec.js';

// Canonical Permit2 contract — same address on every EVM chain via CREATE2.
// See https://github.com/Uniswap/permit2 and @x402/evm constants.
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// x402ExactPermit2Proxy — vanity 0x4020…0001. Facilitator calls
// settle()/settleWithPermit() on this contract. Buyers don't interact with
// it directly; we just declare it as the Permit2 spender witness target.
export const X402_EXACT_PERMIT2_PROXY_ADDRESS = '0x402085c248EeA27D92E8b30b2C58ed07f9E20001';

// Per-network EIP-2612 domain `version` for the canonical native USDC.
// Used by clients that want to skip an on-chain DOMAIN_SEPARATOR fetch. Base
// USDC (FiatTokenV2_2) is at "2"; Arbitrum native USDC also "2".
const USDC_EIP2612_VERSION_BY_NETWORK = {
	[NETWORK_BASE_MAINNET]: '2',
};

// CDP is the only facilitator we route to that currently settles Permit2 +
// gas-sponsoring. If CDP creds are absent we must NOT advertise these
// extensions — the buyer would sign Permit2 typed-data, send it to our
// PayAI-routed Base endpoint, and the settle call would fail with a clean
// `unsupported_scheme` from PayAI.
export function facilitatorSupportsPermit2GasSponsoring() {
	return Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET);
}

// Build a v2 PaymentRequirements accept entry that uses Permit2 instead of
// EIP-3009. Same `payTo` (the seller wallet) and same `asset` (USDC); just
// flips `extra.assetTransferMethod` so the client routes through the proxy.
//
// The `extra.spender` field is non-standard but harmless — some clients use
// it as a hint for the Permit2 PermitWitnessTransferFrom typed-data, which
// requires the spender (= x402ExactPermit2Proxy) explicitly.
export function buildBaseUsdcPermit2Accept({ priceAtomics, resourceUrl }) {
	if (!env.X402_PAY_TO_BASE) return null;
	const network = NETWORK_BASE_MAINNET;
	return {
		scheme: 'exact',
		network,
		amount: String(priceAtomics),
		maxTimeoutSeconds: 60,
		resource: resourceUrl,
		payTo: env.X402_PAY_TO_BASE,
		asset: env.X402_ASSET_ADDRESS_BASE,
		extra: {
			name: 'USD Coin',
			version: USDC_EIP2612_VERSION_BY_NETWORK[network] || '2',
			decimals: 6,
			assetTransferMethod: 'permit2',
			spender: X402_EXACT_PERMIT2_PROXY_ADDRESS,
			permit2Address: PERMIT2_ADDRESS,
		},
	};
}

// Merged extension declarations advertising both gas-sponsoring extensions.
// Returns the object shape expected at `PaymentRequired.extensions` — keyed
// by extension identifier (`eip2612GasSponsoring`, `erc20ApprovalGasSponsoring`).
// Returns null when the facilitator can't honor them, so callers can spread
// `...(permit2GasSponsoringExtensions() || {})` without conditionals.
export function permit2GasSponsoringExtensions() {
	if (!facilitatorSupportsPermit2GasSponsoring()) return null;
	return {
		...declareEip2612GasSponsoringExtension(),
		...declareErc20ApprovalGasSponsoringExtension(),
	};
}
