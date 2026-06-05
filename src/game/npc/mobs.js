// Hostile mobs & enforcers (W08 × W07).
//
// Mobs are consequential — they deal damage and drop loot — so unlike the
// ambient crowd they are NOT client-authoritative. Their existence, health,
// damage, and rewards belong to the combat system (W07). This module is the
// *visual + navigation* half: given an authoritative hostile from W07, it puts a
// body in the world and walks it toward its target along the nav graph; contact
// is only ever *reported* to W07, which decides the outcome. Nothing here can be
// spoofed from the client because nothing here grants an effect.
//
// W07 isn't merged yet, so this system is fully gated: with no `window.twsCombat`
// contract present it spawns nothing and fakes no combat — it simply sleeps until
// the foundation it depends on lands. The contract it consumes:
//
//   window.twsCombat.onHostileSpawn(cb)    cb({ id, kind, pos, target, speed })
//   window.twsCombat.onHostileState(cb)    cb({ id, pos?, target? })   // server moves
//   window.twsCombat.onHostileDespawn(cb)  cb({ id })
//   window.twsCombat.reportContact(id)     // mob reached melee range — server rules
//
// When W07 ships, mobs light up with zero changes here.

import { Group, Mesh, Vector3, CapsuleGeometry, SphereGeometry, MeshStandardMaterial } from 'three';

const MOB_TINT = { enforcer: 0x3a4656, bandit: 0x5a2a2a };
const CONTACT_RANGE = 1.6;       // metres — when we tell W07 the mob is in melee
const REPATH_INTERVAL = 0.6;     // s between navmesh queries while chasing

// A single hostile body — a menacing capsule until W07 supplies a model. It walks
// toward a target the server owns; it never decides anything.
class Mob {
	constructor(scene, nav, spec) {
		this.scene = scene;
		this.nav = nav;
		this.id = spec.id;
		this.speed = spec.speed || 2.4;
		this.target = new Vector3(spec.target?.x || 0, 0, spec.target?.z || 0);
		this._path = [];
		this._repathIn = 0;
		this._contacted = false;

		this.rig = new Group();
		this.rig.position.set(spec.pos?.x || 0, 0, spec.pos?.z || 0);
		const tint = MOB_TINT[spec.kind] || MOB_TINT.enforcer;
		const body = new Mesh(new CapsuleGeometry(0.32, 0.8, 4, 10), new MeshStandardMaterial({ color: tint, roughness: 0.85 }));
		body.position.y = 0.95; body.castShadow = true;
		const head = new Mesh(new SphereGeometry(0.26, 12, 10), new MeshStandardMaterial({ color: tint, roughness: 0.8 }));
		head.position.y = 1.65; head.castShadow = true;
		this.rig.add(body, head);
		scene.add(this.rig);
	}

	setTarget(pos) { if (pos) { this.target.set(pos.x || 0, 0, pos.z || 0); this._repathIn = 0; } }
	setPos(pos) { if (pos) this.rig.position.set(pos.x || 0, 0, pos.z || 0); }

	async _repath() {
		this._path = await this.nav.findPath(this.rig.position, this.target);
	}

	update(dt, onContact) {
		this._repathIn -= dt;
		if (this._repathIn <= 0) { this._repathIn = REPATH_INTERVAL; this._repath(); }

		const wp = this._path[0];
		if (wp) {
			const p = this.rig.position;
			const dx = wp.x - p.x, dz = wp.z - p.z;
			const dist = Math.hypot(dx, dz);
			if (dist < 0.4) { this._path.shift(); }
			else {
				const step = Math.min(dist, this.speed * dt);
				p.x += dx / dist * step; p.z += dz / dist * step;
				this.rig.rotation.y = Math.atan2(dx, dz);
			}
		}

		// Reached melee range of its target: report once and let W07 rule on it.
		const tx = this.target.x - this.rig.position.x, tz = this.target.z - this.rig.position.z;
		if (!this._contacted && Math.hypot(tx, tz) < CONTACT_RANGE) {
			this._contacted = true;
			onContact?.(this.id);
		} else if (this._contacted && Math.hypot(tx, tz) > CONTACT_RANGE * 1.5) {
			this._contacted = false; // left melee — allow a future contact report
		}
	}

	dispose() { this.scene.remove(this.rig); }
}

export class MobSystem {
	constructor({ scene, nav }) {
		this.scene = scene;
		this.nav = nav;
		this.mobs = new Map();
		this._unsub = [];

		const combat = typeof window !== 'undefined' ? window.twsCombat : null;
		this.enabled = !!(combat && typeof combat.onHostileSpawn === 'function');
		if (!this.enabled) return; // W07 absent — sleep, spawn nothing, fake nothing

		this.combat = combat;
		this._unsub.push(combat.onHostileSpawn((spec) => this._spawn(spec)));
		if (combat.onHostileState) this._unsub.push(combat.onHostileState((s) => this._state(s)));
		if (combat.onHostileDespawn) this._unsub.push(combat.onHostileDespawn(({ id }) => this._despawn(id)));
	}

	_spawn(spec) {
		if (!spec?.id || this.mobs.has(spec.id)) return;
		this.mobs.set(spec.id, new Mob(this.scene, this.nav, spec));
	}
	_state(s) {
		const m = this.mobs.get(s?.id);
		if (!m) return;
		if (s.target) m.setTarget(s.target);
		if (s.pos) m.setPos(s.pos);
	}
	_despawn(id) {
		const m = this.mobs.get(id);
		if (m) { m.dispose(); this.mobs.delete(id); }
	}

	update(dt) {
		if (!this.enabled || !this.mobs.size) return;
		const report = (id) => { try { this.combat.reportContact?.(id); } catch { /* contract optional */ } };
		for (const m of this.mobs.values()) m.update(dt, report);
	}

	dispose() {
		for (const fn of this._unsub) { try { fn?.(); } catch { /* ignore */ } }
		this._unsub = [];
		for (const m of this.mobs.values()) m.dispose();
		this.mobs.clear();
	}
}
