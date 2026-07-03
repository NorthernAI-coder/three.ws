// Live Trading Theater — the shared 3D stage.
//
// A single Three.js scene holds every staged agent as a real 3D avatar, arranged
// in a tiered arc so the highest-reputation performers stand center-front. When a
// REAL on-chain event for an agent lands (driven from src/theater-feed.js, which
// tails the same Redis-backed feed every surface uses), that agent's avatar plays
// a one-shot performance and a real receipt rises above it with an explorer link.
//
// No timers fake activity here: this module only animates when the controller
// hands it a real, already-confirmed event. The idle loop is the only ambient
// motion, and it's the pre-baked canonical clip every avatar shares.
//
// Reuses the platform primitives rather than rebuilding them:
//   • gltfLoader(renderer)         — shared Draco/KTX2/Meshopt loader
//   • AnimationManager             — retargets the canonical clip library onto any rig
//   • agentAvatarGlb(agent)        — resolves a real GLB (custom or mannequin fallback)
// so a brand-new agent with no custom body still renders as a real figure, never a
// T-pose (CLAUDE.md: no rig allowlist, mannequin is the designed fallback).
//
// Rigged avatars only. The stage is a performance space — every body must be able
// to act. A resolved avatar earns the stage only if it's a drivable humanoid rig
// with sane proportions; a static forge prop, a non-humanoid mesh, or a broken rig
// is swapped for the rigged mannequin at load time and never staged as-is. That's
// what stops a forge blob from sprawling across the floor instead of standing as a
// figure that can idle and react.

import {
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	Group,
	Box3,
	Vector3,
	Color,
	Fog,
	HemisphereLight,
	DirectionalLight,
	SpotLight,
	PointLight,
	CircleGeometry,
	RingGeometry,
	CylinderGeometry,
	MeshStandardMaterial,
	MeshBasicMaterial,
	Mesh,
	Raycaster,
	Vector2,
	SRGBColorSpace,
	ACESFilmicToneMapping,
	DoubleSide,
} from 'three';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { gltfLoader, disposeGltfLoader } from './loaders/gltf.js';
import { AnimationManager } from './animation-manager.js';
import { agentAvatarGlb, MANNEQUIN_GLB } from './shared/agent-3d.js';
import { log } from './shared/log.js';

// Reaction vocabulary mapped onto the real pre-baked clip library
// (public/animations/manifest.json). Each kind picks deterministically from its
// pool so the same agent reacting to the same event type looks consistent.
const REACTIONS = {
	win:    ['celebrate', 'av-celebrating', 'av-joy', 'av-cheering'],
	buy:    ['av-cheering', 'celebrate', 'av-joy'],
	launch: ['av-celebrating', 'celebrate', 'av-joy'],
	verify: ['wave', 'av-cheering'],
	pay:    ['av-cheering', 'wave'],
	loss:   ['defeated', 'reaction'],
	taunt:  ['taunt', 'reaction'],
};
const ALL_REACTION_CLIPS = [...new Set(Object.values(REACTIONS).flat())];

// Clips every performer registers. `idle` loops as the resting state; the rest
// are one-shots loaded lazily on first reaction so startup only fetches idle.
const CLIP_DEFS = [
	{ name: 'idle', url: '/animations/clips/idle.json', loop: true },
	...ALL_REACTION_CLIPS.map((name) => ({ name, url: `/animations/clips/${name}.json`, loop: false })),
];

const _box = new Box3();
const _v = new Vector3();
const _v2 = new Vector3();

function scaleToHeight(obj, h) {
	_box.setFromObject(obj, true);
	const cur = _box.max.y - _box.min.y || 1;
	obj.scale.multiplyScalar(h / cur);
}
function groundFeet(obj) {
	_box.setFromObject(obj, true);
	if (Number.isFinite(_box.min.y)) obj.position.y -= _box.min.y;
}

// Deterministic small hash so a given agent id always picks the same reaction
// from a pool (stable performances across reconnects).
function hashPick(arr, key) {
	let h = 0;
	const s = String(key || '');
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return arr[Math.abs(h) % arr.length];
}

/**
 * Tiered-arc layout: rank 0 dead center & closest to camera, then fan outward
 * and back in widening rows. Returns { x, z, scale } for a given index.
 */
function arcSlot(index, total) {
	// Rows of increasing width: 3, 5, 7, … keeps the front row tight and the
	// crowd receding so the leader reads as center stage.
	let row = 0;
	let placed = 0;
	let rowSize = 3;
	let idxInRow = index;
	while (idxInRow >= rowSize) {
		idxInRow -= rowSize;
		placed += rowSize;
		row += 1;
		rowSize += 2;
	}
	const spanHalf = (rowSize - 1) / 2;
	const spread = 1.55 + row * 0.25; // wider gaps further back
	const x = (idxInRow - spanHalf) * spread;
	const z = -row * 2.15;
	const scale = Math.max(0.86, 1 - row * 0.05); // gentle falloff with depth
	return { x, z, scale };
}

export function createStage({ canvas, overlay, onSelect, reducedMotion = false }) {
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.12;

	const scene = new Scene();
	scene.fog = new Fog(0x05050a, 14, 38);

	const camera = new PerspectiveCamera(42, 1, 0.1, 200);
	camera.position.set(0, 2.35, 9.4);
	camera.lookAt(0, 1.25, -2);

	// Lighting — a cool key from above the audience plus a warm rim so avatars
	// read against the near-black backdrop. Violet accent matches the finance tokens.
	scene.add(new HemisphereLight(0xaab4ff, 0x0a0a12, 0.9));
	const key = new DirectionalLight(0xffffff, 1.5);
	key.position.set(3, 9, 6);
	scene.add(key);
	const rim = new DirectionalLight(0x8b5cf6, 0.8);
	rim.position.set(-5, 4, -6);
	scene.add(rim);
	const spot = new SpotLight(0xc4b5fd, 1.6, 30, Math.PI / 5, 0.4, 1.2);
	spot.position.set(0, 11, 4);
	spot.target.position.set(0, 0, -1);
	scene.add(spot);
	scene.add(spot.target);

	// Stage floor — a dark reflective-feeling disc with a violet ring horizon.
	const floor = new Mesh(
		new CircleGeometry(22, 64),
		new MeshStandardMaterial({ color: 0x0b0b14, roughness: 0.62, metalness: 0.35 }),
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0;
	scene.add(floor);
	const ring = new Mesh(
		new RingGeometry(7.6, 7.9, 96),
		new MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.28, side: DoubleSide }),
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.01;
	scene.add(ring);

	// Group that holds all performers so we can gently auto-orbit the whole cast.
	const cast = new Group();
	scene.add(cast);

	const loader = gltfLoader(renderer);
	const templates = new Map(); // glbUrl → Promise<{ scene }>
	const performers = new Map(); // agentId → performer record
	const receipts = []; // floating DOM receipts anchored to world points

	let disposed = false;
	let raf = 0;
	let last = performance.now();
	let autoOrbit = !reducedMotion;
	let orbitYaw = 0;
	let highlightId = null;

	// ── Avatar templates ────────────────────────────────────────────────────────
	function template(url) {
		if (templates.has(url)) return templates.get(url);
		const p = loader
			.loadAsync(url)
			.then((gltf) => {
				gltf.scene.traverse((n) => { if (n.isMesh) { n.frustumCulled = true; n.castShadow = false; } });
				return { scene: gltf.scene };
			})
			.catch((err) => {
				log.warn('[theater] template load failed', url, err?.message);
				return { scene: null };
			});
		templates.set(url, p);
		return p;
	}

	// Build a candidate body from a GLB url: clone it, size it to the stage, and
	// attach the canonical animation rig. Reports whether the result is a rigged,
	// sanely-proportioned humanoid we can actually drive — the gate that keeps
	// static forge props and exploded rigs off the stage. Returns null if the GLB
	// has no usable scene. The returned body is not yet parented to the scene, so
	// a rejected candidate can be disposed without any teardown of live state.
	async function buildBody(url, slot) {
		const tpl = await template(url);
		if (!tpl.scene) return null;

		const model = cloneSkinnedScene(tpl.scene);
		model.traverse((n) => { if (n.isMesh) n.frustumCulled = true; });
		scaleToHeight(model, 1.74 * slot.scale);
		groundFeet(model);

		const anim = new AnimationManager();
		let drivable = false;
		try {
			anim.attach(model, { avatarUrl: url });
			anim.setAnimationDefs(CLIP_DEFS);
			drivable = anim.supportsCanonicalClips();
		} catch (err) {
			log.warn('[theater] anim attach failed', url, err?.message);
		}

		// Proportion sanity: a rigged avatar occupies a tall, narrow box (even arms
		// fully out, span ≈ height). A forge prop or a mesh exploded by a bad rig
		// sprawls far wider — reject it so it can never reach the stage as a blob.
		_box.setFromObject(model, true);
		const h = _box.max.y - _box.min.y || 1;
		const wide = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z);
		const humanoid = Number.isFinite(wide) && wide / h <= 3;

		return { model, anim, drivable: drivable && humanoid };
	}

	async function addPerformer(agent, index, total) {
		if (disposed || performers.has(agent.id)) return;
		const slot = arcSlot(index, total);

		// Rigged avatars only. Try the agent's own model first; if it isn't a
		// drivable humanoid, swap in the rigged mannequin (the platform's designed
		// fallback) rather than staging forge geometry as-is.
		const url = agentAvatarGlb(agent);
		let body = await buildBody(url, slot);
		if (disposed || performers.has(agent.id)) { body?.anim?.dispose?.(); return; }
		if ((!body || !body.drivable) && url !== MANNEQUIN_GLB) {
			body?.anim?.dispose?.();
			body = await buildBody(MANNEQUIN_GLB, slot);
			if (disposed || performers.has(agent.id)) { body?.anim?.dispose?.(); return; }
		}
		if (!body || !body.model) return;

		const { model, anim, drivable } = body;

		const group = new Group();
		group.name = `performer:${agent.id}`;
		group.add(model);
		group.position.set(slot.x, 0, slot.z);
		group.rotation.y = (Math.atan2(-group.position.x, 9 - group.position.z) || 0) * 0.35; // toward the audience
		group.userData.agentId = agent.id;
		cast.add(group);

		// A soft pedestal glow under each performer; brightens when highlighted.
		const pad = new Mesh(
			new CircleGeometry(0.78, 40),
			new MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.0, side: DoubleSide }),
		);
		pad.rotation.x = -Math.PI / 2;
		pad.position.set(slot.x, 0.02, slot.z);
		cast.add(pad);

		if (drivable && !reducedMotion) anim.play('idle');

		const rec = { agent, group, model, pad, anim, drivable, slot, busy: false, plate: null };
		rec.plate = makePlate(rec, index);
		performers.set(agent.id, rec);
	}

	// A projected DOM nameplate over each performer: shows who's on stage (the
	// bodies are otherwise anonymous), and IS the primary hit target — a real
	// keyboard-focusable button, far more reliable to click than a posed skinned
	// mesh, and accessible on touch. The body raycast stays as a secondary path.
	function makePlate(rec, index) {
		const btn = document.createElement('button');
		btn.className = 'th-plate';
		btn.type = 'button';
		btn.tabIndex = 0;
		btn.setAttribute('aria-label', `${rec.agent.name || 'Agent'} — open details`);
		const name = document.createElement('span');
		name.className = 'th-plate-name';
		name.textContent = rec.agent.name || 'Agent';
		btn.appendChild(name);
		if (Number.isFinite(rec.agent.score)) {
			const pip = document.createElement('span');
			pip.className = 'th-plate-score';
			pip.textContent = String(Math.round(rec.agent.score));
			btn.appendChild(pip);
		}
		btn.addEventListener('click', (e) => { e.stopPropagation(); onSelect?.(rec.agent.id); });
		overlay.appendChild(btn);
		return btn;
	}

	/**
	 * Reconcile the staged cast with a new roster (room switch / refresh). Removes
	 * performers no longer present and adds new ones, preserving any that stay.
	 */
	async function setRoster(agents) {
		const keep = new Set(agents.map((a) => a.id));
		for (const [id, rec] of [...performers]) {
			if (!keep.has(id)) removePerformer(id, rec);
		}
		// Add sequentially with a micro-yield so a full room fills progressively
		// instead of stalling one frame on a dozen GLB clones.
		for (let i = 0; i < agents.length; i++) {
			if (disposed) return;
			await addPerformer(agents[i], i, agents.length);
			if ((i & 3) === 3) await new Promise((r) => setTimeout(r, 0));
		}
	}

	function removePerformer(id, rec) {
		performers.delete(id);
		try { rec.anim?.dispose?.(); } catch {}
		rec.plate?.remove();
		rec.group?.parent?.remove(rec.group);
		rec.pad?.parent?.remove(rec.pad);
		rec.group?.traverse?.((n) => {
			if (n.isMesh) { n.geometry?.dispose?.(); disposeMaterial(n.material); }
		});
	}

	function disposeMaterial(m) {
		if (!m) return;
		(Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose?.());
	}

	// ── Performances ─────────────────────────────────────────────────────────────
	/**
	 * Trigger a real performance for an agent. `kind` selects the reaction pool;
	 * `receipt` (optional) is a DOM node that rises above the avatar and fades.
	 * No-op if the agent isn't staged — the controller still shows it in the ticker.
	 */
	function perform(agentId, { kind = 'win', receipt = null } = {}) {
		const rec = performers.get(agentId);
		if (!rec) { if (receipt) attachReceiptToCenter(receipt); return false; }
		if (rec.drivable && !reducedMotion) {
			const pool = REACTIONS[kind] || REACTIONS.win;
			const clip = hashPick(pool, agentId + kind);
			rec.busy = true;
			rec.anim.playOnce(clip, { settleTo: 'idle' });
		}
		pulsePad(rec);
		if (receipt) attachReceiptToPerformer(rec, receipt);
		return true;
	}

	function pulsePad(rec) {
		rec.pad.material.opacity = 0.55;
		rec.pad.userData.fade = performance.now();
	}

	// ── Floating receipts (DOM projected over the canvas) ───────────────────────
	// Anchored to the rotating cast so a receipt tracks its performer as the stage
	// orbits; centre receipts (for unstaged actors) anchor to the stage middle.
	function attachReceiptToCenter(el) {
		receipts.push({ el, anchor: new Vector3(0, 2.4, -1), born: performance.now(), rise: 1.1 });
		overlay.appendChild(el);
	}
	function attachReceiptToPerformer(rec, el) {
		receipts.push({ el, born: performance.now(), rise: 0.9, follow: rec });
		overlay.appendChild(el);
	}

	/**
	 * A centerpiece object for a launch / coin-buy spectacle — a glowing token
	 * coin rises from the stage floor, holds, then sinks and is removed. Driven
	 * only by a real coin-buy/launch event.
	 */
	function spawnCenterpiece({ tint = 0x8b5cf6 } = {}) {
		const coin = new Mesh(
			new CylinderGeometry(0.62, 0.62, 0.12, 40),
			new MeshStandardMaterial({ color: tint, emissive: new Color(tint), emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.25 }),
		);
		coin.rotation.x = Math.PI / 2;
		coin.position.set(0, 0.2, -1);
		coin.userData.born = performance.now();
		scene.add(coin);
		const glow = new PointLight(tint, 2.4, 9, 2);
		glow.position.set(0, 1.6, -1);
		scene.add(glow);
		coin.userData.glow = glow;
		centerpieces.push(coin);
	}
	const centerpieces = [];

	// ── Selection (raycast) ──────────────────────────────────────────────────────
	const raycaster = new Raycaster();
	const ndc = new Vector2();
	let downX = 0, downY = 0, downAt = 0;
	function onPointerDown(e) { downX = e.clientX; downY = e.clientY; downAt = performance.now(); }
	function onPointerUp(e) {
		const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
		if (moved > 8 || performance.now() - downAt > 600) return; // a drag, not a click
		const rect = canvas.getBoundingClientRect();
		ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(ndc, camera);
		const hits = raycaster.intersectObjects(cast.children, true);
		for (const h of hits) {
			let o = h.object;
			while (o && !o.userData?.agentId) o = o.parent;
			if (o?.userData?.agentId) { onSelect?.(o.userData.agentId); return; }
		}
	}
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);

	// Drag to rotate the cast; pauses auto-orbit while dragging.
	let dragging = false, lastX = 0;
	canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; autoOrbit = false; });
	window.addEventListener('pointerup', () => { dragging = false; });
	window.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		orbitYaw += (e.clientX - lastX) * 0.005;
		lastX = e.clientX;
	});

	function highlight(agentId) {
		highlightId = agentId;
	}

	// ── Render loop ──────────────────────────────────────────────────────────────
	function frame(now) {
		if (disposed) return;
		raf = requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;

		if (autoOrbit && !reducedMotion) orbitYaw += dt * 0.06;
		cast.rotation.y = orbitYaw;
		ring.rotation.z += dt * 0.05;

		if (!reducedMotion) {
			for (const rec of performers.values()) {
				if (rec.drivable) rec.anim.update(dt);
				// fade pedestal pulse back down
				if (rec.pad.material.opacity > 0) {
					const target = rec.agent.id === highlightId ? 0.32 : 0;
					rec.pad.material.opacity += (target - rec.pad.material.opacity) * Math.min(1, dt * 3);
				} else if (rec.agent.id === highlightId) {
					rec.pad.material.opacity = 0.32;
				}
			}
		}

		// Centerpiece coins: rise (0–0.6s), hold, sink + remove (after 3.4s).
		for (let i = centerpieces.length - 1; i >= 0; i--) {
			const coin = centerpieces[i];
			const age = (now - coin.userData.born) / 1000;
			coin.rotation.z += dt * 2.2;
			coin.position.y = age < 0.6 ? 0.2 + age * 2.4 : age < 2.8 ? 1.64 : Math.max(0.2, 1.64 - (age - 2.8) * 2.4);
            if (coin.userData.glow) coin.userData.glow.position.y = coin.position.y + 0.3;
			if (age > 3.4) {
				scene.remove(coin); if (coin.userData.glow) scene.remove(coin.userData.glow);
				coin.geometry.dispose(); disposeMaterial(coin.material);
				centerpieces.splice(i, 1);
			}
		}

		cast.updateMatrixWorld();
		projectPlates();
		projectReceipts(now);
		renderer.render(scene, camera);
	}

	function projectPlates() {
		const rect = canvas.getBoundingClientRect();
		for (const rec of performers.values()) {
			const plate = rec.plate;
			if (!plate) continue;
			_v.set(rec.group.position.x, 1.96 * (rec.slot?.scale || 1), rec.group.position.z).applyMatrix4(cast.matrixWorld);
			_v2.copy(_v).project(camera);
			const onScreen = _v2.z < 1 && _v2.x > -1.05 && _v2.x < 1.05;
			if (!onScreen) { plate.style.opacity = '0'; plate.style.pointerEvents = 'none'; continue; }
			const x = (_v2.x * 0.5 + 0.5) * rect.width;
			const y = (-_v2.y * 0.5 + 0.5) * rect.height;
			// Fade with depth so the back rows recede; nearest stay crisp.
			const depth = Math.max(0, Math.min(1, (_v2.z - 0.96) / 0.04));
			plate.style.opacity = String(0.95 - depth * 0.55);
			plate.style.pointerEvents = 'auto';
			plate.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
			plate.classList.toggle('is-highlight', rec.agent.id === highlightId);
		}
	}

	function projectReceipts(now) {
		for (let i = receipts.length - 1; i >= 0; i--) {
			const r = receipts[i];
			const age = (now - r.born) / 1000;
			if (age > 4.4) { r.el.remove(); receipts.splice(i, 1); continue; }
			// follow a moving performer (cast rotates), else use static anchor
			if (r.follow) {
				_v.set(r.follow.group.position.x, 2.05 * (r.follow.slot?.scale || 1), r.follow.group.position.z);
				_v.applyMatrix4(cast.matrixWorld);
			} else {
				_v.copy(r.anchor);
			}
			_v.y += Math.min(r.rise, age * r.rise); // rise then settle
			_v2.copy(_v).project(camera);
			const rect = canvas.getBoundingClientRect();
			const x = (_v2.x * 0.5 + 0.5) * rect.width;
			const y = (-_v2.y * 0.5 + 0.5) * rect.height;
			const visible = _v2.z < 1 && x > -120 && x < rect.width + 120;
			r.el.style.opacity = visible ? String(age < 0.25 ? age / 0.25 : age > 3.6 ? Math.max(0, (4.4 - age) / 0.8) : 1) : '0';
			r.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
		}
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	function setReducedMotion(on) {
		reducedMotion = on;
		autoOrbit = !on;
		for (const rec of performers.values()) {
			if (!rec.drivable) continue;
			if (on) rec.anim.freeze?.();
			else rec.anim.play('idle');
		}
	}

	function dispose() {
		disposed = true;
		cancelAnimationFrame(raf);
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointerup', onPointerUp);
		for (const [id, rec] of [...performers]) removePerformer(id, rec);
		for (const r of receipts) r.el.remove();
		receipts.length = 0;
		for (const coin of centerpieces) { scene.remove(coin); coin.userData.glow && scene.remove(coin.userData.glow); }
		try { disposeGltfLoader(renderer); } catch {}
		renderer.dispose();
	}

	resize();
	raf = requestAnimationFrame(frame);

	return {
		setRoster,
		perform,
		spawnCenterpiece,
		highlight,
		resize,
		setReducedMotion,
		dispose,
		hasPerformer: (id) => performers.has(id),
		get count() { return performers.size; },
	};
}
