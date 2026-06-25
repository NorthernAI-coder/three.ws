// Omniology Arena — world bootstrap.
//
// `OmniologyArena` owns the renderer, scene, camera, render loop, the local
// player controller (keyboard / on-screen joystick / drag-to-orbit camera), a
// placeholder lit environment, and an `update(dt)` registry that later prompts
// hook into. It deliberately does NOT touch multiplayer, avatars, or the
// Omniology contest feed — the entry module (omniology.js) wires those on top,
// and prompts 02–04 mount the venue GLB, the live screens, and the entry desk
// through `anchors` + `registerUpdatable`.
//
// Movement, camera, and input feel are matched 1:1 to the /play scene
// (coincommunities.js) so the arena reads as the same engine: MOVE_SPEED,
// RUN_SPEED, GRAVITY, JUMP_VELOCITY, the camera basis, and the joystick deadzone
// are the same constants. Avatar loading/animation is reused from the shared
// avatar-rig library by the entry module, not reinvented here.

import {
	Scene, WebGLRenderer, PerspectiveCamera, Group, Vector3, Vector2,
	PCFShadowMap, SRGBColorSpace, ACESFilmicToneMapping,
	Color, Fog,
	HemisphereLight, DirectionalLight, AmbientLight, PointLight,
	Mesh, MeshStandardMaterial, MeshBasicMaterial,
	CircleGeometry, RingGeometry, GridHelper,
} from 'three';
import { log } from '../../shared/log.js';
import { CLIP_IDLE, CLIP_WALK } from '../avatar-rig.js';

// Locomotion + camera tuning, identical to /play so the two worlds feel the same.
export const MOVE_SPEED = 4.2;
export const RUN_SPEED = 8.0;       // hold Shift to sprint
export const RUN_TIMESCALE = 1.7;   // speed the walk cycle up so a sprint reads as a run
export const JUMP_VELOCITY = 5.5;   // m/s upward kick on Space
export const GRAVITY = 15;          // m/s^2 pulling the jumper back down
export const REMOTE_LERP = 0.18;    // peer interpolation factor (used by RemotePlayer)
const JOY_DEADZONE = 0.12;          // swallow tiny stick grazes so the avatar doesn't drift

// The walkable disc. A touch inside the server's 60m clamp so a local prediction
// never outruns the authoritative bound and snaps back. Prompt 02 replaces the
// placeholder floor + this bound with the venue GLB's real collision geometry.
const ARENA_RADIUS = 26;

// Default mount points. Prompt 02 resolves the real ones from the venue GLB's
// named empties and calls `setAnchors()`. Everything downstream (spawn, screens,
// desk) reads from here, so swapping in the venue is a single call — no consumer
// edits. Coordinates are a sensible authored layout: spawn near the back, three
// screens across the front wall, an entry desk to the right.
function defaultAnchors() {
	return {
		spawn: { position: new Vector3(0, 0, 8), rotationY: Math.PI },
		screens: [
			{ position: new Vector3(-9, 4.2, -15), width: 7.5, rotationY: 0.32 },
			{ position: new Vector3(0, 4.6, -16.5), width: 9, rotationY: 0 },
			{ position: new Vector3(9, 4.2, -15), width: 7.5, rotationY: -0.32 },
		],
		desk: { position: new Vector3(12, 0, 2), rotationY: -Math.PI / 2 },
		lights: [],
	};
}

export class OmniologyArena {
	/** @param {HTMLCanvasElement} canvas */
	constructor(canvas) {
		this.canvas = canvas;
		this.anchors = defaultAnchors();

		// Members registered via registerUpdatable() — each gets update(dt) per frame.
		// 03/04 register their screen + desk handles here so they animate without
		// editing this loop. A Set so a handle can unregister itself on dispose.
		this._updatables = new Set();

		// Local player controller state, mirrored from coincommunities.js.
		this.keys = new Set();
		this._joy = null;
		this.camYaw = 0.6; this.camPitch = 0.5; this.camDist = 9;
		const spawn = this.anchors.spawn;
		this.localPos = new Vector3(spawn.position.x, 0, spawn.position.z);
		this.localYaw = spawn.rotationY;
		this.motion = 'idle';
		this.vy = 0;
		this.grounded = true;
		this._dragging = false; this._lastPtr = null; this._downPtr = null;
		this._last = performance.now();
		this._raf = 0;
		this._disposed = false;

		// The local avatar rig is attached by the entry module once its GLB loads.
		this.localRig = null;
		this.localAnim = null;
		this.localHeight = 1.7;

		// Stable bound handlers so dispose() can remove every listener it added.
		this._onResize = this._onResize.bind(this);
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onPointerDown = this._onPointerDown.bind(this);
		this._onPointerUp = this._onPointerUp.bind(this);
		this._onPointerMove = this._onPointerMove.bind(this);
		this._onWheel = this._onWheel.bind(this);
		this._loop = this._loop.bind(this);

		this._initRenderer();
		this._initScene();
		this._buildEnvironment();
		this._bindInput();
		this._initJoystick();

		this._raf = requestAnimationFrame(this._loop);
	}

	// ---------------------------------------------------------------- renderer
	_initRenderer() {
		let r;
		try {
			r = new WebGLRenderer({ canvas: this.canvas, antialias: true });
		} catch (err) {
			// Blocklisted GPUs / disabled hardware acceleration / some embedded
			// browsers. Tag it so the boot guard can show a recovery message instead
			// of a dead loader.
			const e = new Error('WebGL unavailable: ' + (err?.message || err));
			e.code = 'NO_WEBGL';
			throw e;
		}
		r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		r.setSize(window.innerWidth, window.innerHeight);
		r.shadowMap.enabled = true;
		r.shadowMap.type = PCFShadowMap;
		r.outputColorSpace = SRGBColorSpace;
		r.toneMapping = ACESFilmicToneMapping;
		r.toneMappingExposure = 1.05;
		this.renderer = r;
		window.addEventListener('resize', this._onResize);
	}

	_initScene() {
		const scene = new Scene();
		this.scene = scene;
		// Cool near-black backdrop with matched fog so the floor melts into the
		// horizon instead of ending at a hard edge — reads as a room, not a void.
		this._skyColor = new Color(0x07080c);
		scene.background = this._skyColor;
		scene.fog = new Fog(this._skyColor.getHex(), 34, 96);

		this.camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
		this.camera.position.set(0, 6, 16);
	}

	// Placeholder lit environment: a dark technical floor with a hairline grid, a
	// glowing boundary ring, soft venue accent lights, and a cool key light that
	// casts shadows. Prompt 02 replaces all of this with the venue GLB — every
	// object here is tracked in `_envObjects` so disposal is total.
	_buildEnvironment() {
		this._envObjects = [];
		const track = (obj) => { this._envObjects.push(obj); return obj; };

		// Lighting rig.
		const hemi = new HemisphereLight(0x9fb4ff, 0x05060a, 0.55);
		this.scene.add(track(hemi));
		const ambient = new AmbientLight(0xffffff, 0.18);
		this.scene.add(track(ambient));

		const key = new DirectionalLight(0xdfe8ff, 1.55);
		key.position.set(14, 26, 12);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		key.shadow.camera.near = 1;
		key.shadow.camera.far = 90;
		key.shadow.camera.left = -ARENA_RADIUS - 6;
		key.shadow.camera.right = ARENA_RADIUS + 6;
		key.shadow.camera.top = ARENA_RADIUS + 6;
		key.shadow.camera.bottom = -ARENA_RADIUS - 6;
		key.shadow.bias = -0.0004;
		this.scene.add(track(key));
		this._keyLight = key;

		// Warm-ish accent fills near the front screen wall so the space has depth and
		// the screens (mounted in 03) sit in a pool of light, not flat dark.
		const accentDefs = [
			{ x: -9, z: -13, color: 0x6ea8ff },
			{ x: 9, z: -13, color: 0x8a7bff },
		];
		for (const def of accentDefs) {
			const p = new PointLight(def.color, 22, 40, 2);
			p.position.set(def.x, 6, def.z);
			this.scene.add(track(p));
		}

		// Floor: a wide dark disc that receives shadow.
		const floorGeo = new CircleGeometry(ARENA_RADIUS + 30, 64);
		const floorMat = new MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.92, metalness: 0.05 });
		const floor = new Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		this.scene.add(track(floor));

		// Inner venue platform — a slightly lighter, slightly raised stage disc so the
		// walkable area reads as an authored room within the larger ground.
		const stageGeo = new CircleGeometry(ARENA_RADIUS, 64);
		const stageMat = new MeshStandardMaterial({ color: 0x12151d, roughness: 0.8, metalness: 0.1 });
		const stage = new Mesh(stageGeo, stageMat);
		stage.rotation.x = -Math.PI / 2;
		stage.position.y = 0.02;
		stage.receiveShadow = true;
		this.scene.add(track(stage));

		// Hairline technical grid over the stage.
		const grid = new GridHelper(ARENA_RADIUS * 2, ARENA_RADIUS * 2, 0x2a3142, 0x161a24);
		grid.position.y = 0.03;
		grid.material.transparent = true;
		grid.material.opacity = 0.45;
		this.scene.add(track(grid));
		this._grid = grid;

		// Glowing boundary ring at the walkable edge.
		const ringGeo = new RingGeometry(ARENA_RADIUS - 0.25, ARENA_RADIUS, 96);
		const ringMat = new MeshBasicMaterial({ color: 0x6ea8ff, transparent: true, opacity: 0.5, depthWrite: false });
		const ring = new Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.04;
		this.scene.add(track(ring));
		this._ring = ring;
	}

	// ----------------------------------------------------------------- anchors
	// Replace the authored placeholder anchors with the venue GLB's resolved set
	// (prompt 02). Merges so a partial set still keeps sensible defaults, and
	// re-seats the player at the new spawn if they haven't moved yet.
	setAnchors(next) {
		if (!next) return;
		this.anchors = {
			spawn: next.spawn || this.anchors.spawn,
			screens: Array.isArray(next.screens) ? next.screens : this.anchors.screens,
			desk: next.desk || this.anchors.desk,
			lights: Array.isArray(next.lights) ? next.lights : this.anchors.lights,
		};
		return this.anchors;
	}

	// Move the local player to the current spawn anchor (called once the avatar is
	// attached, and re-usable by 02 after the venue resolves its real spawn).
	seatAtSpawn() {
		const s = this.anchors.spawn;
		if (!s) return;
		this.localPos.set(s.position.x, 0, s.position.z);
		this.localYaw = s.rotationY || 0;
		this.vy = 0; this.grounded = true; this.motion = 'idle';
		if (this.localRig) { this.localRig.position.copy(this.localPos); this.localRig.rotation.y = this.localYaw; }
	}

	// --------------------------------------------------------------- updatables
	// Register an object with an update(dt) method to be ticked each frame. Returns
	// an unregister function. 03/04 hook their screen + desk handles here.
	registerUpdatable(obj) {
		if (!obj || typeof obj.update !== 'function') {
			throw new Error('OmniologyArena.registerUpdatable: object needs an update(dt) method');
		}
		this._updatables.add(obj);
		return () => this._updatables.delete(obj);
	}

	// ------------------------------------------------------------ local avatar
	// The entry module loads the local avatar via the shared avatar-rig library
	// and hands the rig + animation manager here; the loop then drives its
	// position, yaw, and idle/walk crossfade. Passing null detaches it.
	attachLocalAvatar(rig, anim, height) {
		this.localRig = rig || null;
		this.localAnim = anim || null;
		this.localHeight = height || 1.7;
		if (this.localRig) {
			this.localRig.position.copy(this.localPos);
			this.localRig.rotation.y = this.localYaw;
			if (!this.localRig.parent) this.scene.add(this.localRig);
		}
	}

	// The authoritative local state to stream to peers (CommunityNet.sendMove).
	getLocalState() {
		return {
			x: this.localPos.x, y: this.localPos.y, z: this.localPos.z,
			yaw: this.localYaw, motion: this.motion,
		};
	}

	// Project a world point to CSS pixels for DOM overlays (nameplates, bubbles).
	// Returns { x, y, visible }. Shared by RemotePlayer for label placement.
	project(worldVec, into = null) {
		const v = (into || new Vector3()).copy(worldVec).project(this.camera);
		const w = this.renderer.domElement.clientWidth;
		const h = this.renderer.domElement.clientHeight;
		return {
			x: (v.x * 0.5 + 0.5) * w,
			y: (-v.y * 0.5 + 0.5) * h,
			visible: v.z > -1 && v.z < 1,
		};
	}

	// --------------------------------------------------------------- input
	_bindInput() {
		window.addEventListener('keydown', this._onKeyDown);
		window.addEventListener('keyup', this._onKeyUp);
		this.canvas.addEventListener('pointerdown', this._onPointerDown);
		window.addEventListener('pointerup', this._onPointerUp);
		window.addEventListener('pointermove', this._onPointerMove);
		this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
	}

	_onKeyDown(e) {
		// Don't steal typing focus from any future HUD input.
		const t = e.target;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		if (e.code === 'Space') { e.preventDefault(); this._jump(); return; }
		this.keys.add(e.key.toLowerCase());
	}
	_onKeyUp(e) { this.keys.delete(e.key.toLowerCase()); }

	_onPointerDown(e) {
		this._dragging = true;
		this._lastPtr = { x: e.clientX, y: e.clientY };
	}
	_onPointerUp() { this._dragging = false; }
	_onPointerMove(e) {
		if (!this._dragging || !this._lastPtr) return;
		const dx = e.clientX - this._lastPtr.x, dy = e.clientY - this._lastPtr.y;
		this._lastPtr = { x: e.clientX, y: e.clientY };
		this.camYaw -= dx * 0.005;
		this.camPitch = Math.max(0.1, Math.min(1.2, this.camPitch + dy * 0.004));
	}
	_onWheel(e) {
		e.preventDefault();
		this.camDist = Math.max(4, Math.min(20, this.camDist * (e.deltaY > 0 ? 1.1 : 0.9)));
	}

	// Self-contained pointer-events joystick (touch + mouse-drag) — same contract
	// and deadzone as /play, no external lib. Sums with WASD in _stepLocal.
	_initJoystick() {
		const zone = document.getElementById('cc-joystick');
		if (!zone) return;
		this._joyZone = zone;
		const base = document.createElement('div');
		base.className = 'cc-joy-base';
		const thumb = document.createElement('div');
		thumb.className = 'cc-joy-thumb';
		base.appendChild(thumb);
		zone.appendChild(base);
		this._joyNodes = [base, thumb];

		const RADIUS = 48;
		let activeId = null;
		const setFromPointer = (clientX, clientY) => {
			const r = base.getBoundingClientRect();
			const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
			let dx = (clientX - cx) / RADIUS, dy = (clientY - cy) / RADIUS;
			const m = Math.hypot(dx, dy);
			if (m > 1) { dx /= m; dy /= m; }
			thumb.style.transform = `translate(${dx * RADIUS}px, ${dy * RADIUS}px)`;
			const mag = Math.min(1, m);
			if (mag < JOY_DEADZONE) { this._joy = null; return; }
			const k = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE) / mag;
			this._joy = { x: dx * k, z: dy * k };
		};
		const release = () => {
			activeId = null; this._joy = null;
			thumb.style.transform = 'translate(0px, 0px)';
			zone.classList.remove('cc-joy-active');
		};
		const onDown = (e) => {
			activeId = e.pointerId;
			zone.setPointerCapture(e.pointerId);
			zone.classList.add('cc-joy-active');
			setFromPointer(e.clientX, e.clientY);
			e.preventDefault();
		};
		const onMove = (e) => { if (e.pointerId === activeId) { setFromPointer(e.clientX, e.clientY); e.preventDefault(); } };
		const onUp = (e) => { if (e.pointerId === activeId) release(); };
		zone.addEventListener('pointerdown', onDown);
		zone.addEventListener('pointermove', onMove);
		zone.addEventListener('pointerup', onUp);
		zone.addEventListener('pointercancel', onUp);
		zone.addEventListener('lostpointercapture', onUp);
		// Kept for teardown.
		this._joyHandlers = { onDown, onMove, onUp };
	}

	_jump() {
		if (!this.grounded) return;
		this.vy = JUMP_VELOCITY;
		this.grounded = false;
	}

	// ---------------------------------------------------------------- loop
	_loop() {
		this._raf = requestAnimationFrame(this._loop);
		const now = performance.now();
		const dt = Math.min(0.05, (now - this._last) / 1000);
		this._last = now;

		this._stepLocal(dt);
		this.localAnim?.update(dt);
		for (const u of this._updatables) {
			try { u.update(dt); } catch (err) { log.warn('[arena] updatable threw:', err?.message); }
		}
		this._updateCamera();
		this.renderer.render(this.scene, this.camera);
	}

	_stepLocal(dt) {
		// Vertical integration first so a jump arcs even while standing still.
		if (!this.grounded) {
			this.vy -= GRAVITY * dt;
			this.localPos.y += this.vy * dt;
			if (this.localPos.y <= 0) { this.localPos.y = 0; this.vy = 0; this.grounded = true; }
		}

		// Movement intent from keys + joystick, mapped into the camera's basis so the
		// controls read screen-relative (W goes away from the camera, D tracks right).
		let ix = 0, iz = 0;
		if (this.keys.has('w') || this.keys.has('arrowup')) iz -= 1;
		if (this.keys.has('s') || this.keys.has('arrowdown')) iz += 1;
		if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
		if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
		if (this._joy) { ix += this._joy.x; iz += this._joy.z; }
		const running = this.keys.has('shift');
		const mag = Math.hypot(ix, iz);
		if (mag > 0.05) {
			ix /= Math.max(1, mag); iz /= Math.max(1, mag);
			const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
			const wx = ix * cos - iz * sin;
			const wz = -ix * sin - iz * cos;
			const speed = running ? RUN_SPEED : MOVE_SPEED;
			this.localPos.x += wx * speed * dt;
			this.localPos.z += wz * speed * dt;
			const r = Math.hypot(this.localPos.x, this.localPos.z);
			if (r > ARENA_RADIUS) { this.localPos.x *= ARENA_RADIUS / r; this.localPos.z *= ARENA_RADIUS / r; }
			this.localYaw = Math.atan2(wx, wz);
			const want = running ? 'run' : 'walk';
			if (this.motion !== want) { this.motion = want; this.localAnim?.crossfadeTo(CLIP_WALK, 0.18); }
		} else if (this.motion !== 'idle') {
			this.motion = 'idle';
			this.localAnim?.crossfadeTo(CLIP_IDLE, 0.2);
		}
		// Drive the walk cycle faster while sprinting so it reads as a run.
		if (this.localAnim?.currentName === CLIP_WALK) {
			this.localAnim.setSpeed(this.motion === 'run' ? RUN_TIMESCALE : 1);
		}
		if (this.localRig) { this.localRig.position.copy(this.localPos); this.localRig.rotation.y = this.localYaw; }
	}

	_updateCamera() {
		// Track the avatar on the ground plane only — ignore jump height so the
		// camera stays planted while the character hops.
		const tx = this.localPos.x, tz = this.localPos.z;
		const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
		const ox = Math.sin(this.camYaw) * cp * this.camDist;
		const oz = Math.cos(this.camYaw) * cp * this.camDist;
		const oy = sp * this.camDist + 1.4;
		this.camera.position.set(tx - ox, oy, tz - oz);
		this.camera.lookAt(tx, 1.4, tz);
	}

	_onResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	// ---------------------------------------------------------------- teardown
	// Full teardown modeled on coincommunities.js leave(): stop the loop, drop every
	// listener, dispose all GPU resources (geometry/material/texture), and free the
	// renderer so navigating away leaks nothing. The entry module disposes its own
	// net + avatars first, then calls this.
	dispose() {
		if (this._disposed) return;
		this._disposed = true;

		cancelAnimationFrame(this._raf);
		this._raf = 0;

		window.removeEventListener('resize', this._onResize);
		window.removeEventListener('keydown', this._onKeyDown);
		window.removeEventListener('keyup', this._onKeyUp);
		window.removeEventListener('pointerup', this._onPointerUp);
		window.removeEventListener('pointermove', this._onPointerMove);
		this.canvas.removeEventListener('pointerdown', this._onPointerDown);
		this.canvas.removeEventListener('wheel', this._onWheel);

		// Joystick listeners + DOM.
		if (this._joyZone && this._joyHandlers) {
			const z = this._joyZone, h = this._joyHandlers;
			z.removeEventListener('pointerdown', h.onDown);
			z.removeEventListener('pointermove', h.onMove);
			z.removeEventListener('pointerup', h.onUp);
			z.removeEventListener('pointercancel', h.onUp);
			z.removeEventListener('lostpointercapture', h.onUp);
		}
		for (const n of this._joyNodes || []) n.remove();
		this._joyNodes = null; this._joyHandlers = null;

		this._updatables.clear();

		// Detach (but don't dispose) the local avatar — the entry module owns it.
		if (this.localRig?.parent) this.localRig.parent.remove(this.localRig);
		this.localRig = null; this.localAnim = null;

		// Dispose every GPU resource still in the scene graph.
		const seenMat = new Set();
		const disposeMaterial = (m) => {
			if (!m || seenMat.has(m)) return;
			seenMat.add(m);
			for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap']) {
				m[k]?.dispose?.();
			}
			m.dispose?.();
		};
		this.scene?.traverse((obj) => {
			obj.geometry?.dispose?.();
			const mat = obj.material;
			if (Array.isArray(mat)) mat.forEach(disposeMaterial); else disposeMaterial(mat);
		});
		// GridHelper materials/geometry live outside the standard mesh fields above.
		this._grid?.geometry?.dispose?.();
		if (this._grid) { (Array.isArray(this._grid.material) ? this._grid.material : [this._grid.material]).forEach((m) => m?.dispose?.()); }
		this.scene?.clear?.();
		this._envObjects = null;

		this.renderer?.dispose?.();
		this.renderer?.forceContextLoss?.();
		this.renderer = null;
		this.scene = null;
		this.camera = null;
	}
}
