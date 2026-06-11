import { env } from '../_lib/env.js';
import { wrap, cors, error, json, readJson, method, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, createV1 } from '@metaplex-foundation/mpl-core';
import {
	generateSigner,
	publicKey as umiPublicKey,
	signerIdentity,
	createNoopSigner,
} from '@metaplex-foundation/umi';

async function uploadToNftStorage(token, bytes, contentType) {
	const resp = await fetch('https://api.nft.storage/upload', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': contentType,
		},
		body: bytes,
	});
	if (!resp.ok) {
		const txt = await resp.text();
		throw Object.assign(new Error(`NFT.Storage upload failed (${resp.status}): ${txt}`), {
			status: 502,
			code: 'upstream_error',
		});
	}
	const data = await resp.json();
	return `ipfs://${data.value.cid}`;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const storageToken = env.NFT_STORAGE_TOKEN;
	if (!storageToken) return error(res, 503, 'not_configured', 'NFT_STORAGE_TOKEN not configured');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	// The uploads below run on the platform's NFT.Storage token — never let an
	// anonymous caller push arbitrary blobs to IPFS on our account.
	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) {
		return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');
	}

	const body = await readJson(req);
	const { ownerPubkey, glbBase64, thumbnailBase64, name, description } = body || {};

	if (!ownerPubkey || typeof ownerPubkey !== 'string')
		return error(res, 400, 'validation_error', 'ownerPubkey required');
	if (!glbBase64 || typeof glbBase64 !== 'string')
		return error(res, 400, 'validation_error', 'glbBase64 required');
	if (!thumbnailBase64 || typeof thumbnailBase64 !== 'string')
		return error(res, 400, 'validation_error', 'thumbnailBase64 required');
	if (!name || typeof name !== 'string' || !name.trim())
		return error(res, 400, 'validation_error', 'name required');

	let glbUri, thumbUri;
	try {
		[glbUri, thumbUri] = await Promise.all([
			uploadToNftStorage(storageToken, Buffer.from(glbBase64, 'base64'), 'model/gltf-binary'),
			uploadToNftStorage(storageToken, Buffer.from(thumbnailBase64, 'base64'), 'image/png'),
		]);
	} catch (e) {
		return error(res, e.status || 502, e.code || 'upstream_error', e.message);
	}

	const metadata = {
		name: name.trim(),
		description: (description || '').trim(),
		image: thumbUri,
		animation_url: glbUri,
		properties: {
			files: [
				{ uri: glbUri, type: 'model/gltf-binary' },
				{ uri: thumbUri, type: 'image/png' },
			],
			category: '3d',
		},
	};

	let metadataUri;
	try {
		metadataUri = await uploadToNftStorage(
			storageToken,
			Buffer.from(JSON.stringify(metadata)),
			'application/json',
		);
	} catch (e) {
		return error(res, e.status || 502, e.code || 'upstream_error', e.message);
	}

	const rpcUrl = env.SOLANA_RPC_URL;
	const umi = createUmi(rpcUrl).use(mplCore());

	let ownerPk;
	try {
		ownerPk = umiPublicKey(ownerPubkey);
	} catch {
		return error(res, 400, 'validation_error', 'invalid ownerPubkey');
	}

	umi.use(signerIdentity(createNoopSigner(ownerPk)));
	const assetSigner = generateSigner(umi);

	const builder = createV1(umi, {
		asset: assetSigner,
		owner: ownerPk,
		name: name.trim(),
		uri: metadataUri,
	});

	const txBytes = await builder.buildAndSign(umi);
	const unsignedTxBase64 = Buffer.from(txBytes).toString('base64');
	const mint = assetSigner.publicKey.toString();

	return json(res, 200, { unsignedTxBase64, metadataUri, mint });
});
