// Registers the EXT_meshopt_compression decoder with <model-viewer>.
//
// model-viewer auto-loads the Draco and KTX2 decoders, but leaves the Meshopt
// decoder unset. Every server-baked avatar (the /api/avatars/<id>/glb lane and
// Forge output) emits EXT_meshopt_compression, so without this the viewer throws
// "THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed
// files" and the model never renders.
//
// Setting the static `meshoptDecoderLocation` makes model-viewer lazily fetch
// the UMD decoder (it defines a global `MeshoptDecoder`) and register it on its
// GLTFLoader before loading compressed files. This runs once globally and is a
// harmless no-op on pages whose GLBs are uncompressed.
const MESHOPT_DECODER_URL = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js';

customElements.whenDefined('model-viewer').then((resolved) => {
	// Modern browsers resolve whenDefined() with the element constructor; older
	// ones resolve with undefined, so fall back to the registry lookup.
	const ModelViewerElement = resolved || customElements.get('model-viewer');
	if (ModelViewerElement && !ModelViewerElement.meshoptDecoderLocation) {
		ModelViewerElement.meshoptDecoderLocation = MESHOPT_DECODER_URL;
	}
});
