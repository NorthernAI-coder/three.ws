// Agora citizens — the living population of the Commons.
//
// Each citizen from /api/agora/citizens is rendered as an avatar standing in the
// City square: its real `avatarUrl` GLB, canonicalized + retargeted so the shared
// idle clip drives any rig, with a billboarded name + profession label above its
// head. This module owns the *crowd*: loading, pooling, the per-frame loop, and
// hit-testing. Selection state, the passport panel, and accessibility chrome live
// in src/agora/agora-world.js.
//
// Performance is the whole game (the DoD asks for 50 citizens at 60fps):
//   • Each unique avatar GLB is loaded ONCE and its idle/walk clips retargeted
//     ONCE (via AnimationManager). Every citizen wearing that GLB is a cheap
//     SkeletonUtils clone driven by a bare AnimationMixer reusing those bound
//     clips — N mixers, not N retargets. (Same proven pattern as src/club-crowd.js.)
//   • Clip JSON is fetched once and shared across every template.
//   • Concurrent GLB loads are capped so a 50-strong fleet doesn't open 50 sockets.
//   • A rig the canonical library can't drive still renders (the model is shown),
//     it just holds its authored pose instead of idling — never a T-pose void.

import {
	AnimationMixer, Box3, CanvasTexture, Group, Mesh, RingGeometry,
	MeshBasicMaterial, Sprite, SpriteMaterial, Vector3, DoubleSide, SRGBColorSpace,
} from 'three';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { gltfLoader } from '../loaders/gltf.js';
import { AnimationManager } from '../animation-manager.js';
import { loadManifest, getLocomotionDefs, resolveAvatarUrl, CLIP_IDLE } from '../game/avatar-rig.js';
import { log } from '../shared/log.js';

// Target on-screen height so wildly-scaled GLBs all read as people in the square.
const AVATAR_HEIGHT = 1.74;
// Cap simultaneous GLB fetch+parse so a big fleet loads progressively instead of
// saturating the network and stalling the first frame.
const MAX_CONCURRENT_LOADS = 4;
const FADE_IN_SEC = 0.55;

// Profession → accent colour. Keys match the API's profession keys
// (api/agora/[action].js PROFESSIONS). Used for the label chip and selection ring
// so the labour market is legible at a glance. Unknown professions fall back to a
// neutral platform accent — open by design, never a hardcoded allowlist gate.
export const PROFESSION_COLORS = {
	fetcher: '#4ea1ff',
	sculptor: '#ff8a5c',
	scribe: '#9b8cff',
	cartographer: '#36d399',
	crier: '#ff6fae',
	appraiser: '#ffd166',
	verifier: '#5ce0d8',
	namekeeper: '#c0a6ff',
};
const NEUTRAL_ACCENT = '#9fb4cc';

export function professionColor(profession) {
	return PROFESSION_COLORS[String(profession || '').toLowerCase()] || NEUTRAL_ACCENT;
}

const _box = new Box3();
const _v = new Vector3();

function scaleToHeight(obj, h) {
	_box.setFromObject(obj, true);
	const cur = _box.max.y - _box.min.y || 1;
	obj.scale.multiplyScalar(h / cur);
}
function groundFeet(obj) {
	_box.setFromObject(obj, true);
	if (Number.isFinite(_box.min.y)) obj.position.y -= _box.min.y;
}

// Build a crisp, high-DPI billboard label: bold name over a profession chip.
// Returns a Sprite that always faces the camera (sizeAttenuation on, so distant
// labels recede naturally). Drawn on a transparent rounded panel for contrast
// against both bright sky and dark buildings.
function buildLabelSprite(name, profession, accent) {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const padX = 22, nameSize = 34, profSize = 22, gap = 8;
	const font = (px, w) => `${w} ${px}px Inter, system-ui, sans-serif`;

	const measure = document.createElement('canvas').getContext('2d');
	measure.font = font(nameSize, 700);
	const nameW = measure.measureText(name).width;
	const profText = (profession || 'Citizen').toUpperCase();
	measure.font = font(profSize, 600);
	const profW = measure.measureText(profText).width;

	const w = Math.ceil(Math.max(nameW, profW + 26) + padX * 2);
	const h = Math.ceil(nameSize + gap + profSize + 30);

	const c = document.createElement('canvas');
	c.width = Math.ceil(w * dpr);
	c.height = Math.ceil(h * dpr);
	const ctx = c.getContext('2d');
	ctx.scale(dpr, dpr);

	// Rounded translucent panel.
	const r = 12;
	ctx.fillStyle = 'rgba(8, 10, 14, 0.74)';
	ctx.strokeStyle = 'rgba(255,255,255,0.10)';
	ctx.lineWidth = 1;
	roundRect(ctx, 1, 1, w - 2, h - 2, r);
	ctx.fill();
	ctx.stroke();

	// Name.
	ctx.textBaseline = 'top';
	ctx.fillStyle = '#ffffff';
	ctx.font = font(nameSize, 700);
	ctx.fillText(name, padX, 13);

	// Profession chip: accent dot + label.
	const py = 13 + nameSize + gap;
	ctx.fillStyle = accent;
	ctx.beginPath();
	ctx.arc(padX + 6, py + profSize / 2, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,0.78)';
	ctx.font = font(profSize, 600);
	ctx.fillText(profText, padX + 20, py + 1);

	const tex = new CanvasTexture(c);
	tex.colorSpace = SRGBColorSpace;
	tex.needsUpdate = true;
	const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
	const sprite = new Sprite(mat);
	// World height of the label ~0.42m; width preserves the canvas aspect.
	const worldH = 0.46;
	sprite.scale.set(worldH * (w / h), worldH, 1);
	sprite.renderOrder = 2;
	sprite.userData.isLabel = true;
	return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

export class CitizenPopulation {
	/**
	 * @param {object} opts
	 * @param {import('three').WebGLRenderer} opts.renderer
	 * @param {import('three').Scene} opts.scene
	 * @param {boolean} [opts.reducedMotion] honor prefers-reduced-motion (no fade/idle motion)
	 */
	constructor({ renderer, scene, reducedMotion = false }) {
		this.scene = scene;
		this.reducedMotion = reducedMotion;
		this.loader = gltfLoader(renderer);

		this.root = new Group();
		this.root.name = 'agora-citizens';
		scene.add(this.root);

		this.instances = [];          // { citizen, group, model, mixer, label, materials, fade, height }
		this._byId = new Map();       // citizen.id → instance
		this._templates = new Map();  // url → Promise<{ scene, clips, drivable }>
		this._clipJson = null;        // Promise<Map<name, clipJson>>
		this._loadSlots = 0;
		this._loadQueue = [];
		this._disposed = false;

		// A single reusable selection ring, parented to the highlighted citizen.
		this._ring = this._buildRing();
		this._ring.visible = false;
		scene.add(this._ring);
		this._selectedId = null;
	}

	_buildRing() {
		const geo = new RingGeometry(0.5, 0.62, 48);
		geo.rotateX(-Math.PI / 2);
		const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false });
		const ring = new Mesh(geo, mat);
		ring.renderOrder = 1;
		ring.name = 'agora-selection-ring';
		return ring;
	}

	// Fetch idle + walk clip JSON once, shared across every template.
	_ensureClips() {
		if (this._clipJson) return this._clipJson;
		this._clipJson = (async () => {
			await loadManifest();
			const defs = getLocomotionDefs();
			const map = new Map();
			await Promise.all(defs.map(async (d) => {
				try {
					const r = await fetch(d.url, { cache: 'force-cache' });
					if (r.ok) map.set(d.name, await r.json());
				} catch (err) {
					log.warn(`[agora] clip "${d.name}" fetch failed`, err?.message);
				}
			}));
			return map;
		})();
		return this._clipJson;
	}

	// Throttle concurrent GLB loads. Resolves when a slot frees up.
	_acquireSlot() {
		if (this._loadSlots < MAX_CONCURRENT_LOADS) {
			this._loadSlots++;
			return Promise.resolve();
		}
		return new Promise((resolve) => this._loadQueue.push(resolve));
	}
	_releaseSlot() {
		this._loadSlots--;
		const next = this._loadQueue.shift();
		if (next) { this._loadSlots++; next(); }
	}

	// Load a unique GLB once → reusable retargeted idle/walk clips bound to this
	// rig's node names (identical across every SkeletonUtils.clone).
	_template(url) {
		if (this._templates.has(url)) return this._templates.get(url);
		const p = (async () => {
			const clipJson = await this._ensureClips();
			await this._acquireSlot();
			let gltf;
			try {
				gltf = await this.loader.loadAsync(url);
			} finally {
				this._releaseSlot();
			}
			const sceneRoot = gltf.scene;
			sceneRoot.traverse((n) => {
				if (!n.isMesh) return;
				n.castShadow = true;
				n.receiveShadow = false;
			});
			// Retarget against a throwaway clone so the cached template stays pristine.
			const ref = cloneSkinnedScene(sceneRoot);
			const mgr = new AnimationManager();
			mgr.attach(ref, { avatarUrl: url });
			const clips = new Map();
			if (mgr.supportsCanonicalClips()) {
				for (const [name, json] of clipJson) {
					mgr.injectClip(name, json, { loop: true });
					const clip = mgr.actions.get(name)?.getClip?.();
					if (clip) clips.set(name, clip);
				}
			}
			mgr.detach();
			return { scene: sceneRoot, clips, drivable: clips.size > 0 };
		})().catch((err) => {
			log.warn('[agora] template load failed', url, err?.message);
			return { scene: null, clips: new Map(), drivable: false };
		});
		this._templates.set(url, p);
		return p;
	}

	/**
	 * Add one citizen to the world at (x, z) facing roughly toward the plaza
	 * centre. Returns the instance (or null if its GLB couldn't be loaded). Safe
	 * to call concurrently for the whole fleet — loads are pooled internally.
	 *
	 * @param {object} citizen   shaped citizen from /api/agora/citizens
	 * @param {{x:number,z:number}} pos
	 */
	async add(citizen, pos) {
		if (this._disposed || this._byId.has(citizen.id)) return null;
		const url = await resolveAvatarUrl(citizen.avatarUrl || '');
		const tpl = await this._template(url);
		if (this._disposed) return null;
		if (!tpl?.scene) return null;

		const model = cloneSkinnedScene(tpl.scene);
		scaleToHeight(model, AVATAR_HEIGHT);
		groundFeet(model);

		// Per-instance materials so the fade-in opacity is isolated (the template's
		// shared materials/geometry/textures are otherwise reused across clones).
		const materials = [];
		model.traverse((n) => {
			if (!n.isMesh || !n.material) return;
			const mats = Array.isArray(n.material) ? n.material : [n.material];
			const cloned = mats.map((m) => {
				const c = m.clone();
				c.transparent = true;
				c.depthWrite = true;
				return c;
			});
			n.material = Array.isArray(n.material) ? cloned : cloned[0];
			materials.push(...cloned);
		});

		const group = new Group();
		group.name = `citizen-${citizen.id}`;
		group.add(model);
		group.position.set(pos.x, 0, pos.z);
		// Face the plaza centre with a little jitter so the crowd feels gathered,
		// not regimented. atan2(x,z) points the +Z-forward avatar toward origin.
		const baseYaw = Math.atan2(-pos.x, -pos.z);
		group.rotation.y = baseYaw + (hashJitter(citizen.id) - 0.5) * 0.8;
		group.userData.citizenId = citizen.id;
		this.root.add(group);

		const accent = professionColor(citizen.profession || citizen.professions?.[0]?.key);
		const label = buildLabelSprite(citizen.displayName || 'Citizen', citizen.professions?.[0]?.label || citizen.profession, accent);
		_box.setFromObject(model, true);
		const height = Number.isFinite(_box.max.y) ? _box.max.y : AVATAR_HEIGHT;
		label.position.set(0, height + 0.3, 0);
		group.add(label);

		// Idle loop, desynced so the crowd doesn't breathe in lockstep.
		let mixer = null;
		const idleClip = tpl.clips.get(CLIP_IDLE) || [...tpl.clips.values()][0];
		if (idleClip && !this.reducedMotion) {
			mixer = new AnimationMixer(model);
			const action = mixer.clipAction(idleClip);
			action.time = hashJitter(citizen.id + 'x') * (idleClip.duration || 1);
			action.play();
		} else if (idleClip && this.reducedMotion) {
			// Reduced motion: hold a calm idle pose (frame 0), no looping motion.
			mixer = new AnimationMixer(model);
			const action = mixer.clipAction(idleClip);
			action.play();
			mixer.update(0);
			action.paused = true;
		}

		const fade = this.reducedMotion ? null : { t: 0 };
		for (const m of materials) m.opacity = this.reducedMotion ? 1 : 0;

		const inst = { citizen, group, model, mixer, label, materials, fade, height, baseYaw };
		this.instances.push(inst);
		this._byId.set(citizen.id, inst);
		// Pickable meshes carry a back-reference so a raycast hit resolves to the id.
		model.traverse((n) => { if (n.isMesh) n.userData.citizenId = citizen.id; });
		return inst;
	}

	/** Advance idle loops + fade-ins. Cheap: one mixer.update per citizen. */
	update(dt) {
		for (const inst of this.instances) {
			if (!this.reducedMotion) inst.mixer?.update(dt);
			if (inst.fade) {
				inst.fade.t += dt;
				const k = Math.min(1, inst.fade.t / FADE_IN_SEC);
				const eased = k * (2 - k); // ease-out
				for (const m of inst.materials) m.opacity = eased;
				if (k >= 1) {
					for (const m of inst.materials) { m.transparent = false; }
					inst.fade = null;
				}
			}
		}
	}

	/**
	 * Hit-test pickable avatars. Returns the citizen id under the ray, or null.
	 * @param {import('three').Raycaster} raycaster
	 */
	pick(raycaster) {
		const hits = raycaster.intersectObjects(this.root.children, true);
		for (const h of hits) {
			let o = h.object;
			while (o) {
				if (o.userData?.citizenId) return o.userData.citizenId;
				o = o.parent;
			}
		}
		return null;
	}

	/** Move + show the selection ring under a citizen (null clears it). */
	highlight(id) {
		this._selectedId = id;
		const inst = id ? this._byId.get(id) : null;
		if (!inst) { this._ring.visible = false; return; }
		inst.group.getWorldPosition(_v);
		this._ring.position.set(_v.x, 0.02, _v.z);
		const accent = professionColor(inst.citizen.profession || inst.citizen.professions?.[0]?.key);
		this._ring.material.color.set(accent);
		this._ring.visible = true;
	}

	get selectedId() { return this._selectedId; }

	getInstance(id) { return this._byId.get(id) || null; }

	/** World position of a citizen (for framing the camera). Null if unknown. */
	worldPosition(id) {
		const inst = this._byId.get(id);
		if (!inst) return null;
		inst.group.getWorldPosition(_v);
		return _v.clone();
	}

	get count() { return this.instances.length; }

	dispose() {
		this._disposed = true;
		for (const inst of this.instances) {
			inst.mixer?.stopAllAction();
			for (const m of inst.materials) m.dispose?.();
			inst.label.material.map?.dispose?.();
			inst.label.material.dispose?.();
			inst.group.parent?.remove(inst.group);
		}
		this.instances = [];
		this._byId.clear();
		this._ring.geometry.dispose();
		this._ring.material.dispose();
		this.scene.remove(this._ring);
		this.scene.remove(this.root);
		this._templates.clear();
	}
}

// Deterministic per-id jitter in [0,1) — keeps facing/desync stable across
// reloads (no Math.random, so the same citizen always stands the same way).
function hashJitter(seed) {
	const s = String(seed);
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return ((h >>> 0) % 100000) / 100000;
}
