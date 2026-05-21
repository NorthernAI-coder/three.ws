// Builds a single axios instance wrapped with the @x402 client.
//
// Registers, in order of priority:
//   - eip155:* → BatchSettlementEvmScheme  (cheaper per-call, channel-backed)
//   - eip155:* → ExactEvmScheme            (used when a server doesn't advertise
//                                           batch-settlement for the network)
//   - solana:* → ExactSvmScheme            (USDC SPL transfers, fee-payer co-signed)
//
// The @x402 core client picks scheme-per-network based on what the 402
// response advertises in `accepts[].scheme`, so registering both EVM schemes
// against the same wildcard is correct: the scheme whose name matches the
// server's selected accept wins.
//
// Spending cap: `onBeforePaymentCreation` aborts payload creation when the
// selected accept's `amount` (atomic units) exceeds
// `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC`. The default cap is 100_000 atomic
// units of USDC = $0.10. Set the env explicitly for higher-cost endpoints.
//
// Channel storage: `FileClientChannelStorage` persists voucher + cumulative
// amount per channel under `~/.x402-mcp-bridge/channels/client/`. Restart-safe.

import axios from 'axios';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { wrapAxiosWithPayment } from '@x402/axios';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import {
	BatchSettlementEvmScheme,
	FileClientChannelStorage,
} from '@x402/evm/batch-settlement/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';

import { getEvmSigner, getSvmSigner } from './signers.js';
import { getChannelsDirectory } from './storage.js';

const DEFAULT_MAX_PRICE_ATOMIC = 100_000n; // $0.10 USDC
const DEFAULT_DEPOSIT_MULTIPLIER = 5;
const DEFAULT_MAX_DEPOSIT_ATOMIC = 5_000_000n; // $5.00 USDC cap on a single deposit

function maxPriceAtomic() {
	const raw = process.env.MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC;
	if (!raw) return DEFAULT_MAX_PRICE_ATOMIC;
	const v = BigInt(raw);
	if (v < 0n) throw new Error('MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC must be non-negative');
	return v;
}

function maxDepositAtomic() {
	const raw = process.env.MCP_BRIDGE_MAX_DEPOSIT_ATOMIC;
	if (!raw) return DEFAULT_MAX_DEPOSIT_ATOMIC;
	return BigInt(raw);
}

function depositMultiplier() {
	const raw = process.env.MCP_BRIDGE_BATCH_DEPOSIT_MULTIPLIER;
	if (!raw) return DEFAULT_DEPOSIT_MULTIPLIER;
	const v = Number(raw);
	if (!Number.isFinite(v) || v < 1) {
		throw new Error('MCP_BRIDGE_BATCH_DEPOSIT_MULTIPLIER must be a number >= 1');
	}
	return v;
}

function buildSpendingCapHook() {
	const cap = maxPriceAtomic();
	return async ({ selectedRequirements }) => {
		const amount = BigInt(selectedRequirements?.amount ?? '0');
		if (amount > cap) {
			return {
				abort: true,
				reason: `selected accept amount ${amount} exceeds spending cap ${cap} (set MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC to override) — network=${selectedRequirements?.network}, asset=${selectedRequirements?.asset}`,
			};
		}
		return undefined;
	};
}

function buildDepositStrategy() {
	const cap = maxDepositAtomic();
	return ({ depositAmount }) => {
		const amt = BigInt(depositAmount);
		if (amt > cap) return cap.toString();
		return undefined;
	};
}

let cachedAxios;

export async function buildBuyerAxios() {
	if (cachedAxios) return cachedAxios;

	const client = new x402Client();
	client.onBeforePaymentCreation(buildSpendingCapHook());

	const evmSigner = getEvmSigner();
	if (evmSigner) {
		// Register batch-settlement first so it wins when a server advertises
		// scheme="batch-settlement". For scheme="exact" the core client picks
		// ExactEvmScheme — both are registered under the same wildcard.
		const batchScheme = new BatchSettlementEvmScheme(evmSigner, {
			storage: new FileClientChannelStorage({ directory: getChannelsDirectory() }),
			depositPolicy: { depositMultiplier: depositMultiplier() },
			depositStrategy: buildDepositStrategy(),
		});
		client.register('eip155:*', batchScheme);
		client.register('eip155:*', new ExactEvmScheme(evmSigner));
	}

	const svmSigner = await getSvmSigner();
	if (svmSigner) {
		client.register('solana:*', new ExactSvmScheme(svmSigner));
	}

	if (!evmSigner && !svmSigner) {
		throw new Error(
			'No payment signers configured. Set MCP_BRIDGE_EVM_PRIVATE_KEY and/or MCP_BRIDGE_SVM_PRIVATE_KEY before starting the bridge.',
		);
	}

	const httpClient = new x402HTTPClient(client);
	const api = wrapAxiosWithPayment(
		axios.create({
			timeout: 60_000,
			// Surface 4xx/5xx as rejections so the bridge returns errors to the LLM
			// instead of silently producing a "success" tool result with an error body.
			validateStatus: (s) => s >= 200 && s < 300,
		}),
		client,
	);

	cachedAxios = { api, client, httpClient };
	return cachedAxios;
}

export function extractReceipt(httpClient, response) {
	if (!response || !response.headers) return undefined;
	const getHeader = (name) => response.headers[name] ?? response.headers[name.toLowerCase()];
	try {
		return httpClient.getPaymentSettleResponse(getHeader);
	} catch {
		return undefined;
	}
}
