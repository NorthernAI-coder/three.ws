// GET /api/x402-status — operational probe for the x402 wiring.
//
// Reports the configured pay-to addresses, asset mints/contracts, and probes
// each facilitator's /supported endpoint to confirm it advertises scheme=exact
// for the network we route to it. Surfaces misconfigurations (e.g. Coinbase's
// reference facilitator, which only supports base-sepolia) before a paying
// client hits a 502.

import { cors, json, method, wrap } from './_lib/http.js';
import { env } from './_lib/env.js';
import {
	EIP2612_EXTENSION_KEY,
	ERC20_APPROVAL_EXTENSION_KEY,
	declareEip2612GasSponsoringExtension,
	declareErc20ApprovalGasSponsoringExtension,
	paymentRequirements,
	probeFacilitators,
	X402_VERSION,
} from './_lib/x402-spec.js';
import { sql } from './_lib/db.js';
import { hasEvmVerifier } from './_lib/siwx-server.js';

// Read SIWX table counts so operators can confirm at-a-glance whether the
// SIWX rails are wired and active. The tables may not exist on a brand-new
// database (migrations not yet run) — surface that explicitly via
// `configured: false` instead of failing the whole status endpoint.
async function probeSiwx() {
	try {
		const [{ n: paymentsRowCount }] = await sql`
			select count(*)::int as n from siwx_payments
		`;
		const [{ n: noncesRowCount }] = await sql`
			select count(*)::int as n from siwx_nonces
		`;
		return {
			configured: true,
			paymentsRowCount,
			noncesRowCount,
			evmVerifierConfigured: hasEvmVerifier(),
		};
	} catch (err) {
		return {
			configured: false,
			error: err.message,
			evmVerifierConfigured: hasEvmVerifier(),
		};
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const accepts = paymentRequirements();
	const facilitators = await probeFacilitators();
	const siwx = await probeSiwx();
	const ok = facilitators.every((f) => f.ok);

	// Surface what we advertise in 402 challenges so operators can confirm at a
	// glance: which accept entries opt into the Permit2 transfer method, and
	// whether each facilitator's /supported probe actually advertises the
	// `eip2612GasSponsoring` extension we declare. A green `ok` here plus
	// `extensions.eip2612GasSponsoring.facilitatorsSupporting` matching the
	// EVM facilitator set means the gasless Permit2 onboarding path is live.
	const permit2Accepts = accepts.filter((a) => a?.extra?.assetTransferMethod === 'permit2');
	const sponsorshipDeclared = permit2Accepts.length > 0;
	const eip2612FacilitatorsSupporting = facilitators
		.filter((f) => f.supportsEip2612GasSponsoring)
		.map((f) => f.network);
	const erc20FacilitatorsSupporting = facilitators
		.filter((f) => f.supportsErc20ApprovalGasSponsoring)
		.map((f) => f.network);

	return json(
		res,
		ok ? 200 : 503,
		{
			ok,
			x402Version: X402_VERSION,
			accepts,
			facilitators,
			extensions: {
				[EIP2612_EXTENSION_KEY]: {
					declared: sponsorshipDeclared,
					declaration: sponsorshipDeclared
						? declareEip2612GasSponsoringExtension()[EIP2612_EXTENSION_KEY]
						: null,
					appliesTo: permit2Accepts.map((a) => a.network),
					facilitatorsSupporting: eip2612FacilitatorsSupporting,
				},
				[ERC20_APPROVAL_EXTENSION_KEY]: {
					declared: sponsorshipDeclared,
					declaration: sponsorshipDeclared
						? declareErc20ApprovalGasSponsoringExtension()[ERC20_APPROVAL_EXTENSION_KEY]
						: null,
					appliesTo: permit2Accepts.map((a) => a.network),
					facilitatorsSupporting: erc20FacilitatorsSupporting,
				},
			},
			env: {
				X402_PAY_TO_SOLANA: env.X402_PAY_TO_SOLANA || null,
				X402_PAY_TO_BASE: env.X402_PAY_TO_BASE || null,
				X402_ASSET_MINT_SOLANA: env.X402_ASSET_MINT_SOLANA || null,
				X402_ASSET_ADDRESS_BASE: env.X402_ASSET_ADDRESS_BASE || null,
				X402_FEE_PAYER_SOLANA: env.X402_FEE_PAYER_SOLANA || null,
				X402_MAX_AMOUNT_REQUIRED: env.X402_MAX_AMOUNT_REQUIRED || null,
			},
			siwx,
		},
		{ 'cache-control': 'no-store' },
	);
});
