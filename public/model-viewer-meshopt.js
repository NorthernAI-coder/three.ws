// Registers the EXT_meshopt_compression decoder with <model-viewer> as early as
// possible — before any <model-viewer> begins loading, including an eager,
// above-the-fold one whose GLB ships meshopt-compressed.
//
// model-viewer auto-loads the Draco and KTX2 decoders but leaves Meshopt unset.
// Every server-baked avatar (the /api/avatars/<id>/glb lane and Forge output)
// emits EXT_meshopt_compression, so without this the viewer throws
//   "THREE.GLTFLoader: setMeshoptDecoder must be called before loading
//    compressed files"
// and the model never renders.
//
// Timing matters: model-viewer captures its loader's decoder config at the moment
// a load STARTS, not when the GLB finishes downloading. Setting the static
// `meshoptDecoderLocation` after a load has begun is too late — the in-flight
// loader was already built without it. A deferred module that runs *after*
// model-viewer's own module therefore loses the race for an eager element (the
// element upgrades and loads in the microtask between the two module scripts —
// exactly the cz.glb failure seen on /register).
//
// To always win that race this file:
//   1. sets the property synchronously if the element is already defined,
//   2. intercepts customElements.define() so the property is set the instant
//      'model-viewer' is defined — before the element upgrades and loads, and
//   3. keeps a whenDefined() fallback for older browsers.
//
// Load it as a CLASSIC script (no type="module"). Classic scripts execute during
// parsing, before deferred module scripts (model-viewer is one), so the define()
// interceptor is installed before model-viewer is ever defined. It has no imports
// or exports, so it also runs correctly if a page still loads it as a module.
(function () {
	if (!window.customElements) return;
	var DECODER_URL = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js';

	function applyTo(ctor) {
		// `meshoptDecoderLocation` is a writable static on model-viewer; guard the
		// assignment so a future read-only build degrades to a no-op rather than
		// throwing and taking the page's module graph down with it.
		if (ctor && !ctor.meshoptDecoderLocation) {
			try {
				ctor.meshoptDecoderLocation = DECODER_URL;
			} catch (e) {
				/* property not writable in this build — nothing more we can do */
			}
		}
	}

	// 1. Helper ran after model-viewer was defined → set it now, synchronously.
	applyTo(customElements.get('model-viewer'));

	// 2. Helper ran before model-viewer was defined (classic script during parse)
	//    → patch define() so the decoder is registered the moment the element is
	//    defined, before its first reactive update kicks off a load. Idempotent:
	//    a flag prevents double-wrapping if this file is included twice.
	if (!customElements.get('model-viewer') && !customElements.__meshoptDefinePatched) {
		customElements.__meshoptDefinePatched = true;
		var nativeDefine = customElements.define;
		customElements.define = function (name, ctor, options) {
			var result = nativeDefine.call(this, name, ctor, options);
			if (name === 'model-viewer') applyTo(ctor);
			return result;
		};
	}

	// 3. Belt-and-suspenders: covers any path where (1) and (2) both miss.
	customElements.whenDefined('model-viewer').then(function (resolved) {
		applyTo(resolved || customElements.get('model-viewer'));
	});
})();
