/**
 * Emotion → face, the blendshape half of an embodied reply.
 *
 * Lip-sync (AvatarMouthTarget / A2FPlayer) owns the MOUTH while the body speaks;
 * this owns the EXPRESSION — the brows, eyes, cheeks, nose and smile/frown that
 * carry joy, sadness, anger, surprise. It indexes a rig's ARKit-52 morph targets
 * (the shared vocabulary in src/voice/arkit-blendshapes.js) and eases the current
 * weights toward a target set every frame, so an emotion fades in and out instead
 * of snapping.
 *
 * It deliberately does NOT drive jawOpen or the raw viseme channels — those belong
 * to the lip-sync driver, and writing them here would fight the mouth. A rig with
 * no facial morphs is fine: this becomes a no-op and the emotion still reads
 * through the body gesture the stage plays. That graceful degradation is the
 * point — emotion is never lost, it just moves from the face to the body.
 */

import { indexARKitMorphs, canonicalARKitName } from '../../src/voice/arkit-blendshapes.js';

// Channels the lip-sync driver owns — never written by the expression layer.
const MOUTH_RESERVED = new Set(['jawOpen', 'jawForward', 'jawLeft', 'jawRight']);

export class FaceExpression {
	constructor() {
		/** @type {Array<{mesh:object, index:Map<string,number>}>} */
		this._meshes = [];
		this._current = new Map(); // canonical ARKit name → current weight
		this._target = new Map(); // canonical ARKit name → target weight
	}

	/** Bind to a loaded model: collect every mesh that carries ARKit morphs. */
	attach(root) {
		this._meshes = [];
		this._current.clear();
		this._target.clear();
		root?.traverse?.((node) => {
			if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
				const index = indexARKitMorphs(node.morphTargetDictionary);
				if (index.size) this._meshes.push({ mesh: node, index });
			}
		});
		return this;
	}

	/** True if any expression morph is available on this rig. */
	hasMorphs() {
		return this._meshes.length > 0;
	}

	/**
	 * Set the emotion face. Accepts a map of ARKit name → weight (0..1); unknown
	 * names are normalized, mouth-reserved channels are dropped. Pass {} to relax
	 * back to a neutral face.
	 * @param {Record<string, number>} arkitWeights
	 */
	setTarget(arkitWeights = {}) {
		const next = new Map();
		for (const [name, w] of Object.entries(arkitWeights)) {
			const canon = canonicalARKitName(name);
			if (!canon || MOUTH_RESERVED.has(canon)) continue;
			next.set(canon, Math.max(0, Math.min(1, Number(w) || 0)));
		}
		this._target = next;
	}

	/**
	 * Ease current weights toward target and write them to every bound mesh.
	 * @param {number} dt seconds since last frame
	 */
	update(dt) {
		if (!this._meshes.length) return;
		// Time-constant ease (~180ms to most of the way), framerate-independent.
		const k = 1 - Math.exp(-dt / 0.18);
		const names = new Set([...this._current.keys(), ...this._target.keys()]);
		for (const name of names) {
			const cur = this._current.get(name) || 0;
			const tgt = this._target.get(name) || 0;
			const val = cur + (tgt - cur) * k;
			if (val < 0.001 && tgt === 0) this._current.delete(name);
			else this._current.set(name, val);
		}
		for (const { mesh, index } of this._meshes) {
			for (const [name, val] of this._current) {
				const i = index.get(name);
				if (i != null) mesh.morphTargetInfluences[i] = val;
			}
		}
	}

	/** Snap everything to neutral immediately (e.g. on persona swap). */
	reset() {
		this._target = new Map();
		for (const { mesh, index } of this._meshes) {
			for (const i of index.values()) mesh.morphTargetInfluences[i] = 0;
		}
		this._current.clear();
	}
}
