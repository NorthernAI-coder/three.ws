// Manual x402 client — pays /api/x402/model-check on Base mainnet using the
// vanity wallet's private key and verifies the endpoint returns the model
// inspection JSON.
import { Wallet, randomBytes, hexlify } from 'ethers';

const PRIVATE_KEY = process.env.X402_PAYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
	console.error('Set X402_PAYER_PRIVATE_KEY to a funded Base wallet key before running.');
	process.exit(1);
}
const ENDPOINT = 'https://three.ws/api/x402/model-check?url=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb';

const wallet = new Wallet(PRIVATE_KEY);
console.log('Payer:', wallet.address);

// 1. Get 402 challenge.
const challenge = await fetch(ENDPOINT);
console.log('Step 1 — challenge status:', challenge.status);
const challengeBody = await challenge.json();
const required = JSON.parse(Buffer.from(challenge.headers.get('payment-required'), 'base64').toString());
const accept = required.accepts.find(a => a.network === 'eip155:8453' && a.scheme === 'exact');
if (!accept) throw new Error('no Base accept');
console.log('  payTo:', accept.payTo, 'amount:', accept.amount, 'asset:', accept.asset);

// 2. Build EIP-3009 TransferWithAuthorization.
const now = Math.floor(Date.now() / 1000);
const authorization = {
	from: wallet.address,
	to: accept.payTo,
	value: accept.amount,
	validAfter: String(now - 600),
	validBefore: String(now + Math.max(60, accept.maxTimeoutSeconds || 60)),
	nonce: hexlify(randomBytes(32)),
};
const domain = {
	name: accept.extra.name,
	version: accept.extra.version,
	chainId: 8453,
	verifyingContract: accept.asset,
};
const types = {
	TransferWithAuthorization: [
		{ name: 'from', type: 'address' },
		{ name: 'to', type: 'address' },
		{ name: 'value', type: 'uint256' },
		{ name: 'validAfter', type: 'uint256' },
		{ name: 'validBefore', type: 'uint256' },
		{ name: 'nonce', type: 'bytes32' },
	],
};
const signature = await wallet.signTypedData(domain, types, authorization);
console.log('Step 2 — signed payload, sig length:', signature.length);

const payment = {
	x402Version: 2,
	payload: { authorization, signature },
	// CDP's bazaar indexer reads the discovery extension from
	// paymentPayload.extensions.bazaar — if the client strips it, the
	// facilitator settles the payment but never catalogs the endpoint.
	// Mirror the challenge's extensions verbatim so indexing fires.
	extensions: required.extensions || {},
	resource: required.resource,
	accepted: accept,
};
const header = Buffer.from(JSON.stringify(payment)).toString('base64');

// 3. Retry with X-PAYMENT.
const paid = await fetch(ENDPOINT, { headers: { 'X-PAYMENT': header } });
console.log('Step 3 — paid status:', paid.status);
const paymentResponse = paid.headers.get('x-payment-response');
const network = paid.headers.get('x-payment-network');
const tx = paid.headers.get('x-payment-tx');
if (paymentResponse) {
	const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
	console.log('  X-PAYMENT-RESPONSE:', JSON.stringify(decoded, null, 2));
}
if (network) console.log('  X-PAYMENT-NETWORK:', network);
if (tx) console.log('  X-PAYMENT-TX:', tx);
const body = await paid.json();
console.log('  body keys:', Object.keys(body));
if (body.model?.counts) console.log('  model.counts:', body.model.counts);
if (body.suggestions) console.log('  suggestions:', body.suggestions.length, 'item(s)');
if (paid.status !== 200) console.log('  ERROR body:', JSON.stringify(body, null, 2));
