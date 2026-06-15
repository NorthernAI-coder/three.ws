/**
 * ERC-8004 ValidationRegistry attestor (server-side).
 *
 * Turns an agent's GLB into a signed, on-chain validation attestation:
 *
 *   1. Fetch the GLB (SSRF-guarded) and run it through the platform's one glTF
 *      validator — the same inspector behind /api/x402/model-check. Parse-success
 *      ⇒ structurally valid; parse-failure ⇒ a hard error in the report.
 *   2. Independently sha256 the exact bytes (byte-check, surfaced separately —
 *      a passing schema validation never overrides byte identity, per spec).
 *   3. Build the canonical report, pin it to R2, keccak256-hash the pinned bytes.
 *   4. Sign + send recordValidation(agentId, passed, proofHash, proofURI, kind)
 *      from the platform validator key, which must be allow-listed on the chain.
 *
 * Best-effort by contract: callers wrap this in try/catch — a validation failure
 * (or missing key / undeployed registry / not-allow-listed validator) must never
 * block or revert the registration itself. Errors carry a machine-readable
 * `.code` so the caller can surface a clear ops state instead of a silent skip.
 */

import { createHash } from 'node:crypto';
import { Contract, Wallet } from 'ethers';

import { env } from './env.js';
import { CHAIN_BY_ID, VALIDATION_REGISTRY_ABI, validationRegistryFor } from './erc8004-chains.js';
import { evmRpcEndpoints } from './evm/rpc.js';
import { putObject, publicUrl } from './r2.js';
import { assertSafePublicUrl, SsrfBlockedError } from './ssrf-guard.js';
import { inspectModel, suggestOptimizations } from './model-inspect.js';
import { buildGlbReport, hashReport, reportPassed, KIND_GLB_SCHEMA } from '../../src/erc8004/validation-report.js';

const MAX_FETCH_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

class AttestError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'AttestError';
		this.code = code;
	}
}

/**
 * Fetch + validate a GLB. Never throws on an *invalid model* — an unparseable
 * GLB is a valid outcome (a failing report). Only throws on transport/SSRF
 * problems the caller can't attribute to the model.
 *
 * @param {string} glbUrl
 * @param {string} validatedAt  ISO timestamp (caller-supplied).
 * @returns {Promise<{ report: object, passed: boolean, sha256: string, byteLength: number }>}
 */
export async function validateGlb(glbUrl, validatedAt) {
	let parsed;
	try {
		parsed = await assertSafePublicUrl(glbUrl, { allowHttp: true });
	} catch (err) {
		if (err instanceof SsrfBlockedError) throw new AttestError('invalid_glb_url', err.message);
		throw err;
	}

	let upstream;
	try {
		upstream = await fetch(parsed.toString(), {
			redirect: 'follow',
			headers: { accept: 'model/gltf-binary,model/gltf+json,application/octet-stream' },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch (err) {
		throw new AttestError('glb_fetch_failed', `could not fetch GLB: ${err.message}`);
	}
	if (!upstream.ok) {
		throw new AttestError('glb_fetch_failed', `GLB fetch returned ${upstream.status}`);
	}

	const contentLength = Number(upstream.headers.get('content-length') || 0);
	if (contentLength && contentLength > MAX_FETCH_BYTES) {
		throw new AttestError('glb_too_large', `GLB is ${contentLength} bytes; max ${MAX_FETCH_BYTES}`);
	}
	const bytes = new Uint8Array(await upstream.arrayBuffer());
	if (bytes.byteLength > MAX_FETCH_BYTES) {
		throw new AttestError('glb_too_large', `GLB is ${bytes.byteLength} bytes; max ${MAX_FETCH_BYTES}`);
	}

	const sha256 = createHash('sha256').update(bytes).digest('hex');

	let inspect = null;
	let suggestions = [];
	let error = null;
	try {
		inspect = await inspectModel(bytes, { fileSize: bytes.byteLength });
		suggestions = suggestOptimizations(inspect);
	} catch (err) {
		// Unparseable model → a failing report, not a thrown attestation.
		error = err?.message || 'model failed to parse';
	}

	const report = buildGlbReport({
		url: parsed.toString(),
		sha256,
		byteLength: bytes.byteLength,
		inspect,
		suggestions,
		error,
		validatedAt,
	});

	return { report, passed: reportPassed(report), sha256, byteLength: bytes.byteLength };
}

/**
 * Pin the report JSON to R2 and return its public URL.
 * @param {object} report
 * @param {number} chainId
 * @param {string|number} agentId
 * @returns {Promise<string>}
 */
async function pinReport(report, chainId, agentId) {
	const body = Buffer.from(JSON.stringify(report, null, 2));
	const key = `erc8004/validation/${chainId}/${agentId}/${report.byteCheck?.sha256 || 'report'}.json`;
	await putObject({ key, body, contentType: 'application/json' });
	return publicUrl(key);
}

/**
 * Full attestation: validate the GLB, pin the report, sign + record on-chain.
 *
 * @param {object} p
 * @param {number} p.chainId
 * @param {string|number} p.agentId
 * @param {string} p.glbUrl
 * @param {string} p.validatedAt  ISO timestamp (caller-supplied; deterministic hashing).
 * @returns {Promise<{
 *   passed: boolean, proofHash: string, proofURI: string, txHash: string,
 *   sha256: string, validatedAt: string, kind: string, chainId: number,
 *   agentId: string, validator: string, report: object,
 * }>}
 */
export async function attestValidation({ chainId, agentId, glbUrl, validatedAt }) {
	const chain = CHAIN_BY_ID[chainId];
	if (!chain) throw new AttestError('unsupported_chain', `unsupported chain ${chainId}`);

	const registryAddr = validationRegistryFor(chainId);
	if (!registryAddr) {
		throw new AttestError(
			'validation_registry_not_deployed',
			`ValidationRegistry is not deployed on ${chain.name} (chain ${chainId}).`,
		);
	}

	const pk = env.VALIDATOR_PRIVATE_KEY;
	if (!pk) {
		throw new AttestError(
			'validator_key_not_configured',
			'VALIDATOR_PRIVATE_KEY is not set — cannot sign attestations.',
		);
	}

	// 1. Validate the GLB (this part never throws on an invalid model).
	const { report, passed, sha256 } = await validateGlb(glbUrl, validatedAt);

	// 2. Provider + wallet. evmFallbackProvider is read-tuned; for the write we
	//    use a plain JsonRpcProvider on the priority endpoint list.
	const { JsonRpcProvider, Network } = await import('ethers');
	const network = Network.from(chainId);
	const endpoints = evmRpcEndpoints(chainId);
	const provider = new JsonRpcProvider(endpoints[0], network, { staticNetwork: network });
	const wallet = new Wallet(pk, provider);
	const registry = new Contract(registryAddr, VALIDATION_REGISTRY_ABI, wallet);

	// 3. The platform key must be allow-listed on THIS chain — surface a clear
	//    ops error rather than letting the tx revert with NotValidator().
	let allowed;
	try {
		allowed = await registry.isValidator(wallet.address);
	} catch (err) {
		throw new AttestError('registry_read_failed', `could not read validator allow-list: ${err.message}`);
	}
	if (!allowed) {
		throw new AttestError(
			'validator_not_allowlisted',
			`Validator ${wallet.address} is not allow-listed on ${chain.name}. ` +
				`Run addValidator(${wallet.address}) as the registry owner (task 01 step 6).`,
		);
	}

	// 4. Pin the report, hash the pinned bytes, record on-chain.
	const proofURI = await pinReport(report, chainId, agentId);
	const proofHash = hashReport(report);

	let tx;
	try {
		tx = await registry.recordValidation(BigInt(agentId), passed, proofHash, proofURI, KIND_GLB_SCHEMA);
	} catch (err) {
		throw new AttestError('record_failed', `recordValidation reverted: ${err.shortMessage || err.message}`);
	}
	await tx.wait();

	return {
		passed,
		proofHash,
		proofURI,
		txHash: tx.hash,
		sha256,
		validatedAt,
		kind: KIND_GLB_SCHEMA,
		chainId,
		agentId: String(agentId),
		validator: wallet.address,
		report,
	};
}

export { AttestError };
