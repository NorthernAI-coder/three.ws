// Camera state machine for /club.
//
// Three modes:
//   - free  : user-driven orbit around the dance floor (default).
//   - vip   : framed close-up of a single pole's dancer.
//   - house : top-down overhead of the whole room.
//
// Transitions interpolate the (target, offset) pair over ~0.4s. The owning
// scene calls `tick(dt)` once per frame, which advances any pending lerp and
// then writes camera.position + camera.lookAt(target).
//
// Single-author: drag / zoom go through applyDrag / applyZoom — no
// OrbitControls. Drag is ignored in non-free modes; zoom works in free and
// VIP.

import { Vector3 } from 'three';

export const CLUB_CAMERA_MODES = ['free', 'vip', 'house'];

const FREE_OFFSET_BASE = new Vector3(0, 2.2, 7.2);
const FREE_TARGET = new Vector3(0, 1.2, -1.8);

// Per-mode zoom bounds so we don't end up inside the geometry or 30m away.
const ZOOM_BOUNDS = {
	free: { min: 3.5, max: 14.0 },
	vip:  { min: 1.4, max: 5.5 },
};

export class ClubCamera {
	constructor(camera, opts = {}) {
		this.camera = camera;
		this.mode = 'free';
		this.target = FREE_TARGET.clone();
		this.offset = FREE_OFFSET_BASE.clone();
		this.yaw = 0;
		this.pitch = 0.05;
		this._pending = null; // {target, offset, lerp}
		this._onModeChange = opts.onModeChange || null;
	}

	getMode() { return this.mode; }

	_emitMode() {
		if (this._onModeChange) {
			try { this._onModeChange(this.mode); } catch {}
		}
	}

	setFree() {
		const was = this.mode;
		this.mode = 'free';
		this._pending = {
			target: FREE_TARGET.clone(),
			offset: new Vector3(0, 2.2 + this.pitch * 2.5, this.offset.length() > 0 ? this.offset.length() : 7.2),
			lerp: 2.5,
		};
		if (was !== 'free') this._emitMode();
	}

	setVip(poleLayout) {
		if (!poleLayout) return;
		const was = this.mode;
		this.mode = 'vip';
		const target = new Vector3(poleLayout.x, 1.6, poleLayout.z);
		const offset = new Vector3(
			Math.sin(poleLayout.yaw + Math.PI) * 2.6,
			1.3,
			Math.cos(poleLayout.yaw + Math.PI) * 2.6,
		);
		this._pending = { target, offset, lerp: 3.0 };
		this._activeVipId = poleLayout.id || null;
		if (was !== 'vip') this._emitMode();
	}

	setHouse() {
		const was = this.mode;
		this.mode = 'house';
		this._pending = {
			target: new Vector3(0, 0.5, -1.5),
			offset: new Vector3(0, 12, 0.001), // top-down with epsilon to avoid singular up
			lerp: 1.6,
		};
		if (was !== 'house') this._emitMode();
	}

	// Pointer drag — only effective in free orbit.
	applyDrag(dx, dy) {
		if (this.mode !== 'free') return;
		this.yaw -= dx * 0.004;
		this.pitch = Math.max(-0.3, Math.min(0.5, this.pitch - dy * 0.003));
	}

	// Zoom (wheel deltaY or pinch delta). Honored in free + vip.
	// Positive deltaY = wheel-down = zoom out, matching browser convention.
	applyZoom(deltaY) {
		if (this.mode === 'house') return;
		const bounds = ZOOM_BOUNDS[this.mode] || ZOOM_BOUNDS.free;
		const factor = 1 + deltaY * 0.0015;
		const current = this._pending ? this._pending.offset : this.offset;
		const len = current.length();
		if (len < 1e-4) return;
		const nextLen = Math.max(bounds.min, Math.min(bounds.max, len * factor));
		const scale = nextLen / len;
		current.multiplyScalar(scale);
	}

	tick(dt) {
		if (this._pending) {
			const k = Math.min(1, dt * this._pending.lerp);
			this.target.lerp(this._pending.target, k);
			this.offset.lerp(this._pending.offset, k);
			if (
				this.target.distanceTo(this._pending.target) < 0.01 &&
				this.offset.distanceTo(this._pending.offset) < 0.01
			) {
				this.target.copy(this._pending.target);
				this.offset.copy(this._pending.offset);
				this._pending = null;
			}
		}

		if (this.mode === 'free') {
			// In free mode the stored offset is the "base" rest position; rotate
			// it around Y by user yaw to orbit. Pitch is baked into the offset Y.
			const rest = this.offset.clone();
			rest.y = 2.2 + this.pitch * 2.5;
			const rotated = rest.applyAxisAngle(new Vector3(0, 1, 0), this.yaw);
			this.camera.position.copy(this.target.clone().add(rotated));
		} else {
			this.camera.position.copy(this.target.clone().add(this.offset));
		}
		this.camera.lookAt(this.target);
	}
}
