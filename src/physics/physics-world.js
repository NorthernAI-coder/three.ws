// PhysicsWorld — a thin, reusable wrapper over Rapier (3D, WASM-compat build).
//
// Why this exists: the 3D scenes historically faked collision with disc-radius
// clamps and AABB push-out. That stops you at a wall but can't roll a ball,
// push a crate, climb a step, or resolve a slide. This module gives every
// scene one real solver:
//
//   • a kinematic capsule character controller (slides along walls, steps up
//     small ledges, snaps to ground, and shoves dynamic bodies it walks into),
//   • static colliders for world geometry (ground, buildings, trees),
//   • dynamic rigid bodies for props (balls, crates) that fall, roll, and
//     get kicked, with their Three.js meshes synced from the simulation.
//
// Rapier ships its WASM inline in the `-compat` build, so there is no decoder
// file to host — we just await init() once and memoize it. The character
// body's translation is its FEET (the collider is offset upward by its own
// half-height), so callers can copy it straight onto an avatar rig whose
// origin sits on the floor.

import RAPIER from '@dimforge/rapier3d-compat';

let _rapierReady = null;

/** Initialize the Rapier WASM runtime once and reuse it across worlds. */
export function initRapier() {
	if (!_rapierReady) _rapierReady = RAPIER.init().then(() => RAPIER);
	return _rapierReady;
}

const _v = { x: 0, y: 0, z: 0 };

export class PhysicsWorld {
	/**
	 * @param {typeof RAPIER} rapier  initialized Rapier module
	 * @param {{ gravity?: {x:number,y:number,z:number} }} [opts]
	 */
	constructor(rapier, { gravity = { x: 0, y: -14, z: 0 } } = {}) {
		this.RAPIER = rapier;
		this.world = new rapier.World(gravity);
		// Substep budget keeps the dynamic solver stable when a frame runs long
		// (tab refocus, GC pause) without letting bodies tunnel through walls.
		this._fixedDt = 1 / 60;
		this._accumulator = 0;
		this._ground = null; // { body } — persists across environment swaps
		this._obstacles = []; // [{ body }] — cleared/rebuilt per environment
		this._dynamics = []; // [{ body, mesh, spawn }] — props synced to meshes
		this._character = null;
	}

	/** Create a world with the WASM runtime guaranteed ready. */
	static async create(opts) {
		const rapier = await initRapier();
		return new PhysicsWorld(rapier, opts);
	}

	// ── Static world geometry ────────────────────────────────────────────────

	/**
	 * An effectively-infinite floor whose top face sits at `y`. Modeled as a
	 * thick cuboid (not a plane) so the character can never tunnel beneath it.
	 */
	addGround(y = 0, halfSize = 200) {
		const R = this.RAPIER;
		const thickness = 5;
		const body = this.world.createRigidBody(
			R.RigidBodyDesc.fixed().setTranslation(0, y - thickness, 0),
		);
		this.world.createCollider(
			R.ColliderDesc.cuboid(halfSize, thickness, halfSize).setFriction(1),
			body,
		);
		this._ground = { body };
		return body;
	}

	/**
	 * Static heightfield ground from a terrain.js instance. The terrain's height
	 * buffer is column-major — exactly Rapier's layout — so it maps on with no
	 * copy. The collider spans `terrain.size` square, centred on the origin,
	 * with its base at `y`. Replaces (and supersedes) any flat addGround floor so
	 * the character walks the real rolling surface instead of a flat plane.
	 */
	addHeightfield(terrain, { y = 0, friction = 1 } = {}) {
		const R = this.RAPIER;
		if (this._ground) {
			this.world.removeRigidBody(this._ground.body);
			this._ground = null;
		}
		// Rapier's nrows/ncols are SEGMENT counts; it requires
		// heights.length === (nrows+1)·(ncols+1). terrain.points = segments+1,
		// so pass points-1 and the points²-length column-major buffer fits exactly.
		const segs = terrain.points - 1;
		const scale = { x: terrain.size, y: 1, z: terrain.size };
		const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, y, 0));
		this.world.createCollider(
			R.ColliderDesc.heightfield(segs, segs, terrain.heights, scale).setFriction(friction),
			body,
		);
		this._ground = { body };
		return body;
	}

	/** Axis-aligned-ish box obstacle (optionally yaw-rotated). Center-anchored. */
	addStaticBox({ position, halfExtents, rotationY = 0 }) {
		const R = this.RAPIER;
		const desc = R.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
		if (rotationY) {
			const h = rotationY / 2;
			desc.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
		}
		const body = this.world.createRigidBody(desc);
		this.world.createCollider(
			R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
			body,
		);
		this._obstacles.push({ body });
		return body;
	}

	/** Upright cylinder obstacle — trees, posts, palm trunks. Center-anchored. */
	addStaticCylinder({ position, radius, halfHeight }) {
		const R = this.RAPIER;
		const body = this.world.createRigidBody(
			R.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
		);
		this.world.createCollider(R.ColliderDesc.cylinder(halfHeight, radius), body);
		this._obstacles.push({ body });
		return body;
	}

	/** Remove every per-environment obstacle (ground is preserved). */
	clearObstacles() {
		for (const o of this._obstacles) this.world.removeRigidBody(o.body);
		this._obstacles.length = 0;
	}

	// ── Dynamic props ────────────────────────────────────────────────────────

	/**
	 * A dynamic rigid body bound to a Three.js mesh. The mesh is driven by the
	 * simulation every frame in sync(); `spawn` is retained so a prop that
	 * tumbles off the world can be respawned.
	 */
	addDynamicBall({ mesh, radius, restitution = 0.6, density = 0.4, linearDamping = 0.4 }) {
		const R = this.RAPIER;
		const p = mesh.position;
		const body = this.world.createRigidBody(
			R.RigidBodyDesc.dynamic()
				.setTranslation(p.x, p.y, p.z)
				.setLinearDamping(linearDamping)
				.setAngularDamping(0.5),
		);
		this.world.createCollider(
			R.ColliderDesc.ball(radius)
				.setRestitution(restitution)
				.setDensity(density)
				.setFriction(0.6),
			body,
		);
		const entry = { body, mesh, spawn: { x: p.x, y: p.y, z: p.z } };
		this._dynamics.push(entry);
		return entry;
	}

	addDynamicBox({ mesh, halfExtents, restitution = 0.1, density = 0.6, linearDamping = 0.3 }) {
		const R = this.RAPIER;
		const p = mesh.position;
		const body = this.world.createRigidBody(
			R.RigidBodyDesc.dynamic()
				.setTranslation(p.x, p.y, p.z)
				.setLinearDamping(linearDamping)
				.setAngularDamping(0.6),
		);
		this.world.createCollider(
			R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
				.setRestitution(restitution)
				.setDensity(density)
				.setFriction(0.8),
			body,
		);
		const entry = { body, mesh, spawn: { x: p.x, y: p.y, z: p.z } };
		this._dynamics.push(entry);
		return entry;
	}

	/** Remove every dynamic prop body (their meshes are owned by the caller). */
	clearDynamics() {
		for (const d of this._dynamics) this.world.removeRigidBody(d.body);
		this._dynamics.length = 0;
	}

	// ── Character controller ─────────────────────────────────────────────────

	/**
	 * A kinematic capsule whose body translation tracks the FEET position.
	 * Returns a controller façade with move()/setPosition().
	 */
	createCharacter({
		position = { x: 0, y: 0, z: 0 },
		radius = 0.3,
		halfHeight = 0.55,
		offset = 0.04,
	} = {}) {
		const R = this.RAPIER;
		const body = this.world.createRigidBody(
			R.RigidBodyDesc.kinematicPositionBased().setTranslation(
				position.x,
				position.y,
				position.z,
			),
		);
		// Lift the capsule so the body origin is the feet, not the capsule center.
		const collider = this.world.createCollider(
			R.ColliderDesc.capsule(halfHeight, radius).setTranslation(0, radius + halfHeight, 0),
			body,
		);

		const controller = this.world.createCharacterController(offset);
		controller.enableAutostep(0.4, 0.2, true); // step up curbs / ledges
		controller.enableSnapToGround(0.3); // hug terrain on the way down
		controller.setApplyImpulsesToDynamicBodies(true); // kick balls & crates
		controller.setSlideEnabled(true); // slide along walls instead of stopping dead
		controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
		controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);

		this._character = {
			body,
			collider,
			controller,
			/**
			 * Resolve one frame of desired motion against the world.
			 * @param {{x:number,y:number,z:number}} desired  world-space displacement this frame
			 * @returns {{ position:{x:number,y:number,z:number}, grounded:boolean }}
			 */
			move: (desired) => {
				controller.computeColliderMovement(collider, desired);
				const m = controller.computedMovement();
				const t = body.translation();
				_v.x = t.x + m.x;
				_v.y = t.y + m.y;
				_v.z = t.z + m.z;
				body.setNextKinematicTranslation(_v);
				return {
					position: { x: _v.x, y: _v.y, z: _v.z },
					grounded: controller.computedGrounded(),
				};
			},
			/** Hard-teleport (respawn, boundary snap) — bypasses collision. */
			setPosition: (p) => {
				body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
				body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
			},
		};
		return this._character;
	}

	get character() {
		return this._character;
	}

	// ── Per-frame integration ────────────────────────────────────────────────

	/**
	 * Advance the simulation. The character's setNextKinematicTranslation (from
	 * move()) is consumed here, so call move() BEFORE step(). Uses a fixed
	 * timestep accumulator so dynamic bodies stay stable across variable frames.
	 */
	step(dt) {
		this._accumulator += Math.min(dt, 0.1);
		let steps = 0;
		this.world.timestep = this._fixedDt;
		while (this._accumulator >= this._fixedDt && steps < 5) {
			this.world.step();
			this._accumulator -= this._fixedDt;
			steps++;
		}
		this._syncDynamics();
	}

	_syncDynamics() {
		for (const d of this._dynamics) {
			const t = d.body.translation();
			const r = d.body.rotation();
			d.mesh.position.set(t.x, t.y, t.z);
			d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
			// A prop that tumbles into the void gets relaunched from its spawn.
			if (t.y < -8) {
				d.body.setTranslation({ ...d.spawn }, true);
				d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
				d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
			}
		}
	}

	dispose() {
		this.world.free();
		this._ground = null;
		this._obstacles.length = 0;
		this._dynamics.length = 0;
		this._character = null;
	}
}
