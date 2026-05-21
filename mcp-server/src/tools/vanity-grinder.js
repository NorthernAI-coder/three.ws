// `vanity_grinder` — paid MCP tool that brute-forces a Solana keypair whose
// base58 public key starts with a chosen prefix (and optionally ends with a
// chosen suffix).
//
// Pricing: `upto` scheme on Base, max $0.50. Actual settled amount scales
// with the number of attempts: we charge $0.01 base + ~$0.0000001 per
// attempt, capped at $0.50. The x402 facilitator enforces settle ≤ max.
//
// Output (over the same MCP channel — clients should treat as secret):
//   - address (base58)
//   - privateKey64 (base58, full 64-byte secret key as @solana/web3.js expects)
//   - iterations + durationMs
//   - cost: { authorizedMaxUsd, settledUsd, settledAtomic }
//
// The grinder is the same async-yielding routine in api/_lib/pump-vanity.js
// (BASE58_ALPHABET, 6-char max pattern, lowercase ignoreCase support). It
// runs in-process — there is no external service.

import { z } from 'zod';

import { paidUpto } from '../payments.js';
import { grindMintKeypair, estimateAttempts, BASE58_ALPHABET } from '../../../api/_lib/pump-vanity.js';
import bs58 from 'bs58';

const TOOL_NAME = 'vanity_grinder';
const TOOL_DESCRIPTION =
	'Generate a Solana keypair whose base58 address starts with a chosen prefix (and optionally ends with a chosen suffix). Returns the full 64-byte secret key — handle as a secret. Billed via x402 `upto` (max $0.50 USDC on Base); actual cost scales with attempts so easy patterns are nearly free.';

const BASE_USD = 0.01;
const PER_ATTEMPT_USD = 1e-7;
const MAX_USD = 0.5;

function priceForAttempts(attempts) {
	const usd = Math.min(MAX_USD, BASE_USD + attempts * PER_ATTEMPT_USD);
	const atomic = Math.round(usd * 1_000_000); // USDC has 6 decimals
	return { usd: Number(usd.toFixed(6)), atomicUsdc: String(atomic) };
}

const inputJsonSchema = {
	type: 'object',
	properties: {
		prefix: {
			type: 'string',
			description: `Base58 prefix the address must start with. Allowed chars: ${BASE58_ALPHABET}. Max 6 chars.`,
			minLength: 0,
			maxLength: 6,
		},
		suffix: {
			type: 'string',
			description: 'Optional base58 suffix the address must end with. Max 6 chars.',
			minLength: 0,
			maxLength: 6,
		},
		ignoreCase: {
			type: 'boolean',
			description: 'Case-insensitive match (folds upper+lower base58 chars).',
		},
		maxIterations: {
			type: 'integer',
			description: 'Hard cap on grinder iterations. Default 2_000_000.',
			minimum: 1,
			maximum: 5_000_000,
		},
	},
	required: ['prefix'],
	additionalProperties: false,
};

const inputZodShape = {
	prefix: z.string().min(1).max(6),
	suffix: z.string().max(6).optional(),
	ignoreCase: z.boolean().optional(),
	maxIterations: z.number().int().min(1).max(5_000_000).optional(),
};

export async function buildVanityGrinderTool() {
	const handler = await paidUpto(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			priceUsd: '$0.50',
			inputSchema: inputJsonSchema,
			example: { prefix: 'pump' },
			outputExample: {
				address: 'pumpXYZ...',
				privateKey64: '5x...base58...',
				iterations: 12345,
				durationMs: 230,
				cost: { authorizedMaxUsd: 0.5, settledUsd: 0.011, settledAtomic: '11234' },
			},
		},
		async ({ prefix, suffix, ignoreCase = false, maxIterations = 2_000_000 }) => {
			const expected = estimateAttempts({ prefix, suffix, ignoreCase });
			const grind = await grindMintKeypair({
				prefix,
				suffix,
				ignoreCase,
				maxIterations,
			});
			const address = grind.keypair.publicKey.toBase58();
			// @solana/web3.js Keypair.secretKey is the full 64-byte ed25519 secret
			// (32-byte seed || 32-byte pubkey). Wallets like Phantom import this
			// directly as base58. The client is responsible for storing it.
			const privateKey64 = bs58.encode(Buffer.from(grind.keypair.secretKey));
			const price = priceForAttempts(grind.iterations);
			return {
				result: {
					address,
					privateKey64,
					iterations: grind.iterations,
					estimatedIterations: Math.round(expected),
					durationMs: grind.durationMs,
					prefix,
					suffix: suffix || null,
					ignoreCase,
					cost: {
						authorizedMaxUsd: MAX_USD,
						settledUsd: price.usd,
						settledAtomic: price.atomicUsdc,
						pricingNote: '$0.01 base + $0.0000001 per attempt, capped at $0.50',
					},
					_secretWarning:
						'privateKey64 is a real private key. Treat the entire MCP response as a secret and store securely.',
				},
				settleAmount: price.atomicUsdc,
			};
		},
	);
	return {
		name: TOOL_NAME,
		title: 'Solana vanity grinder (upto $0.50)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		handler,
	};
}
