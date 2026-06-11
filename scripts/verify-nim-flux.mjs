// Live verification for the NIM FLUX text→image lane (task T1.3).
//
//   node scripts/verify-nim-flux.mjs "a teapot"     # live generation via NIM
//   node scripts/verify-nim-flux.mjs --degrade      # NIM→Vertex→Replicate order check
//
// Live mode runs a real FLUX.1-schnell generation through textToImage(), lets
// the module persist the artifact via the shared R2 helper, re-fetches the
// persisted object, and asserts it is a real image (JPEG/PNG magic bytes +
// plausible dimensions). Needs NVIDIA_API_KEY plus S3_* creds; when prod R2
// creds are absent (this Codespace), point S3_* at a throwaway local MinIO:
//
//   docker run -d --name minio -p 9000:9000 -e MINIO_ROOT_USER=verify \
//     -e MINIO_ROOT_PASSWORD=verify-secret minio/minio server /data
//   export S3_ENDPOINT=http://127.0.0.1:9000 S3_BUCKET=verify \
//     S3_ACCESS_KEY_ID=verify S3_SECRET_ACCESS_KEY=verify-secret \
//     S3_PUBLIC_DOMAIN=http://127.0.0.1:9000/verify
//
// (.env.local values never override variables already exported in the shell.)
//
// Degrade mode deliberately breaks the NIM lane (invalid key) and gives the
// Vertex and Replicate lanes synthetic config so the chain has somewhere to
// fall: it asserts the attempt ORDER (NIM → Vertex → Replicate) and clean
// error propagation — the downstream lanes are not expected to succeed.
// No scratch files are written; nothing is committed by this script.

import { config as dotenv } from 'dotenv';
dotenv({ path: new URL('../.env.local', import.meta.url) });

const DEGRADE = process.argv.includes('--degrade');
const prompt = process.argv.filter((a) => !a.startsWith('--'))[2] || 'a teapot';

function fail(msg) {
	console.error(`[nim-flux] FAIL — ${msg}`);
	process.exit(1);
}

function sniffImage(buf) {
	if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	if (buf.length > 7 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
	return null;
}

// Walk JPEG markers to the first SOF segment, which carries the frame size.
function jpegDimensions(buf) {
	let i = 2;
	while (i + 9 < buf.length) {
		if (buf[i] !== 0xff) return null;
		const marker = buf[i + 1];
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
		}
		i += 2 + buf.readUInt16BE(i + 2);
	}
	return null;
}

function pngDimensions(buf) {
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

if (DEGRADE) {
	// Break NIM, ensure two downstream lanes look configured (synthetic creds —
	// they are expected to fail too; we are asserting order, not success).
	process.env.NVIDIA_API_KEY = 'nvapi-invalid-degrade-check';
	if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = 'degrade-check-project';
	if (!process.env.REPLICATE_API_TOKEN) process.env.REPLICATE_API_TOKEN = 'r8_invalid_degrade_check';

	const fallbackLogs = [];
	const realError = console.error.bind(console);
	console.error = (...args) => {
		fallbackLogs.push(args.join(' '));
		realError(...args);
	};

	const { textToImage } = await import('../api/_mcp3d/text-to-image.js');
	let finalError = null;
	try {
		await textToImage(prompt);
		fail('degrade run unexpectedly succeeded — every lane had invalid creds');
	} catch (err) {
		finalError = err;
	} finally {
		console.error = realError;
	}

	console.log(`[nim-flux] final surfaced error: ${finalError.message}`);
	const nimIdx = fallbackLogs.findIndex((l) => l.includes('nim flux failed, falling back'));
	const vertexIdx = fallbackLogs.findIndex((l) => l.includes('vertex imagen failed, falling back to replicate'));
	if (nimIdx === -1) fail('NIM lane was never attempted / never handed off');
	if (vertexIdx === -1) fail('Vertex lane was never attempted after NIM');
	if (vertexIdx < nimIdx) fail('Vertex was attempted before NIM — order is wrong');
	if (!finalError?.message) fail('last lane did not propagate a clean Error');
	console.log('[nim-flux] ✓ degrade order verified: NIM → Vertex → Replicate, last lane error surfaced');
	console.log('[nim-flux] PASS (degrade)');
	process.exit(0);
}

if (!process.env.NVIDIA_API_KEY) fail('NVIDIA_API_KEY missing — set it in .env.local');
if (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET) {
	fail('S3_* creds missing — point them at prod R2 or the MinIO recipe in this header');
}

const { textToImage } = await import('../api/_mcp3d/text-to-image.js');

console.log(`[nim-flux] generating via NIM FLUX.1-schnell: "${prompt}"`);
const started = Date.now();
const result = await textToImage(prompt);
const elapsedMs = Date.now() - started;

console.log(`[nim-flux] model: ${result.model}`);
console.log(`[nim-flux] persisted: ${result.imageUrl}`);
console.log(`[nim-flux] end-to-end latency: ${(elapsedMs / 1000).toFixed(1)}s`);
if (result.model !== 'black-forest-labs/flux.1-schnell') {
	fail(`served by ${result.model}, not the NIM lane — check NVIDIA_API_KEY`);
}

// Re-fetch the persisted object and prove it is a real image.
const res = await fetch(result.imageUrl);
if (!res.ok) fail(`persisted image fetch returned ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const kind = sniffImage(buf);
if (!kind) fail(`persisted bytes are neither JPEG nor PNG (first bytes: ${buf.subarray(0, 4).toString('hex')})`);
const dims = kind === 'jpeg' ? jpegDimensions(buf) : pngDimensions(buf);
if (!dims || dims.width < 256 || dims.height < 256) {
	fail(`implausible dimensions: ${JSON.stringify(dims)}`);
}
const extension = result.imageUrl.split('.').pop();
const expectedExt = kind === 'jpeg' ? 'jpg' : 'png';
if (extension !== expectedExt) fail(`persisted as .${extension} but bytes are ${kind}`);
const contentType = res.headers.get('content-type');
console.log(
	`[nim-flux] ✓ valid ${kind.toUpperCase()} — ${dims.width}x${dims.height}, ${buf.byteLength} bytes, ` +
		`content-type ${contentType}, .${extension} key matches bytes`,
);
console.log('[nim-flux] PASS');
