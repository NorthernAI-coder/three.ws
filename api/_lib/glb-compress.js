// Optional server-side GLB geometry compression for the /forge pipeline.
//
// When a caller asks for `output_format: glb-draco` or `glb-meshopt`, this runs a
// real @gltf-transform pass over the delivered mesh and returns a smaller, still-
// valid glTF 2.0 file that renders identically with the right decoder:
//   • draco   — KHR_draco_mesh_compression: best raw size, needs a Draco decoder.
//   • meshopt — EXT_meshopt_compression: slightly larger, decodes fast on the GPU;
//               three.js' GLTFLoader in the three.ws viewer is decoder-equipped.
//
// Geometry only — textures are left untouched (no sharp dependency, no perceptual
// re-encode) so the pass is fast and deterministic and never changes how the model
// looks beyond standard vertex quantization. The heavy codecs (Draco wasm, the
// meshopt encoder) are imported lazily inside compressGlb() so a plain `glb`
// request — the default — never pays to load them.

import { Buffer } from 'node:buffer';

export const COMPRESSION_MODES = Object.freeze(['draco', 'meshopt']);

// Cache the registered IO per mode across calls within a warm instance — building
// the Draco encoder module is the expensive part and is safe to reuse.
const _ioCache = new Map();

async function ioFor(mode) {
	if (_ioCache.has(mode)) return _ioCache.get(mode);
	const { NodeIO } = await import('@gltf-transform/core');
	const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

	if (mode === 'draco') {
		const d = await import('draco3dgltf');
		const draco3d = d.default ?? d;
		io.registerDependencies({
			'draco3d.decoder': await draco3d.createDecoderModule(),
			'draco3d.encoder': await draco3d.createEncoderModule(),
		});
	} else {
		const { MeshoptEncoder, MeshoptDecoder } = await import('meshoptimizer');
		await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
		io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
	}
	_ioCache.set(mode, io);
	return io;
}

/**
 * Compress a GLB's geometry. Returns the compressed buffer plus size stats.
 * Throws on an unparseable buffer or an unknown mode so the caller can fall back
 * to delivering the original, uncompressed mesh.
 *
 * @param {Buffer|Uint8Array} buf - source GLB bytes
 * @param {{ mode?: 'draco' | 'meshopt' }} [opts]
 * @returns {Promise<{
 *   buffer: Buffer,
 *   mode: 'draco' | 'meshopt',
 *   inputBytes: number,
 *   outputBytes: number,
 *   ratio: number,            // outputBytes / inputBytes
 *   grew: boolean,            // true if compression didn't shrink (tiny meshes)
 *   extensionsUsed: string[],
 * }>}
 */
export async function compressGlb(buf, { mode = 'meshopt' } = {}) {
	if (!COMPRESSION_MODES.includes(mode)) {
		throw new Error(`unsupported compression mode: ${mode}`);
	}
	if (!buf || typeof buf.byteLength !== 'number' || buf.byteLength < 20) {
		throw new Error('compressGlb: input is not a GLB buffer');
	}
	const input = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	const inputBytes = input.byteLength;

	const io = await ioFor(mode);
	const { dedup, prune, weld, quantize, draco, meshopt } = await import('@gltf-transform/functions');

	const doc = await io.readBinary(input);

	// dedup + prune first (drop duplicate/orphaned data), then weld to an indexed
	// mesh (both codecs need shared vertices), then the codec-specific encode.
	const steps = [dedup(), prune(), weld()];
	if (mode === 'draco') {
		steps.push(draco());
	} else {
		const { MeshoptEncoder } = await import('meshoptimizer');
		steps.push(quantize(), meshopt({ encoder: MeshoptEncoder }));
	}
	await doc.transform(...steps);

	const out = await io.writeBinary(doc);
	const outputBytes = out.byteLength;
	const extensionsUsed = doc
		.getRoot()
		.listExtensionsUsed()
		.map((e) => e.extensionName);

	return {
		buffer: Buffer.from(out),
		mode,
		inputBytes,
		outputBytes,
		ratio: inputBytes > 0 ? Math.round((outputBytes / inputBytes) * 1000) / 1000 : 1,
		grew: outputBytes >= inputBytes,
		extensionsUsed,
	};
}
