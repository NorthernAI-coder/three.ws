/**
 * Net-Worth Aura — the tasteful, performance-cheap glow that embodies an agent's
 * real wealth/reputation tier around its 3D body.
 *
 * Two additive sprites: a floor halo (a pool of light at the feet) and a soft
 * back-glow behind the figure. Both read as *presence*, never a slot-machine.
 * Intensity/colour come straight from the net-worth look descriptor
 * (src/shared/agent-networth.js → computeLook), which is derived from real chain
 * reads. A zero-value wallet gets a calm, near-invisible floor; a Beacon-tier
 * agent gets a confident violet halo.
 *
 * Reduced-motion safe: the glow holds a static intensity (no pulse) when motion is
 * off, so the tier still reads. Cheap by construction: one shared radial texture,
 * two sprites, no per-frame allocation; the host stops calling update() when the
 * avatar is offscreen.
 */

import * as THREE from 'three';

// One soft radial-alpha texture, shared by every aura instance on the page.
let _spriteTex = null;
function radialTexture() {
	if (_spriteTex) return _spriteTex;
	const s = 128;
	const c = document.createElement('canvas');
	c.width = c.height = s;
	const ctx = c.getContext('2d');
	const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
	g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, s, s);
	_spriteTex = new THREE.CanvasTexture(c);
	_spriteTex.colorSpace = THREE.SRGBColorSpace;
	return _spriteTex;
}

const REDUCED_MOTION =
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

export class NetWorthAura {
	constructor() {
		this.object3D = new THREE.Group();
		this.object3D.name = 'networth-aura';
		this.object3D.renderOrder = -1; // draw behind the avatar

		const tex = radialTexture();
		this._floorMat = new THREE.SpriteMaterial({ map: tex, color: 0x8b5cf6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
		this._backMat = new THREE.SpriteMaterial({ map: tex, color: 0x8b5cf6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });

		this._floor = new THREE.Sprite(this._floorMat);
		this._floor.center.set(0.5, 0.5);
		this._back = new THREE.Sprite(this._backMat);
		this._back.center.set(0.5, 0.5);

		this.object3D.add(this._floor, this._back);

		this._radius = 1;
		this._height = 1.7;
		this._intensity = 0; // target glow 0..1
		this._cur = 0;        // smoothed glow
		this._color = new THREE.Color(0x8b5cf6);
		this._pulse = 0;      // transient additive boost, decays
		this._pulseSign = 1;  // +1 celebratory, -1 subdued
		this._t = 0;
		this.visible = true;
	}

	/** Fit the aura to the avatar's real bounds (call once after the model loads). */
	setBounds({ radius, height, centerY = 0, baseY = 0 } = {}) {
		if (radius > 0) this._radius = radius;
		if (height > 0) this._height = height;
		// Floor halo: flat pool at the feet, ~2.6× footprint.
		const fr = this._radius * 2.6;
		this._floor.scale.set(fr, fr, 1);
		this._floor.position.set(0, baseY + 0.02, 0);
		this._floor.material.rotation = 0;
		// Back-glow: a tall soft column centered on the torso.
		this._back.scale.set(this._radius * 3.2, this._height * 1.25, 1);
		this._back.position.set(0, centerY, -this._radius * 0.4);
		return this;
	}

	/**
	 * Apply a net-worth look. `auraColor` may be a hex string or an [r,g,b] triple;
	 * `glow` (0..1) sets the steady intensity.
	 */
	setLook(look = {}) {
		const glow = Math.max(0, Math.min(1, Number(look.glow ?? look.auraIntensity) || 0));
		this._intensity = glow;
		const c = look.auraColor;
		if (Array.isArray(c)) this._color.setRGB(c[0], c[1], c[2]);
		else if (typeof c === 'string') this._color.set(c);
		this._floorMat.color.copy(this._color);
		this._backMat.color.copy(this._color);
		return this;
	}

	/** Fire a transient pulse on a real event. kind: 'positive' | 'subdued'. */
	pulse(kind = 'positive') {
		if (REDUCED_MOTION) return; // static look only — never flash with motion off
		this._pulseSign = kind === 'subdued' ? -1 : 1;
		this._pulse = kind === 'subdued' ? 0.5 : 1;
	}

	/** Per-frame. Skips work when hidden. dt in seconds. */
	update(dt) {
		if (!this.visible) return;
		this._t += dt;
		// Smoothly chase the target intensity (so tier changes ease in).
		this._cur = lerp(this._cur, this._intensity, dt * 2.5);
		// Decay the transient pulse.
		if (this._pulse > 0.001) this._pulse = Math.max(0, this._pulse - dt * (this._pulseSign > 0 ? 1.1 : 0.7));
		else this._pulse = 0;

		// Gentle breathing on the steady glow (suppressed under reduced motion).
		const breathe = REDUCED_MOTION ? 1 : 1 + 0.06 * Math.sin(this._t * 1.1);
		const pulseBoost = this._pulse * this._pulseSign * 0.6;

		const floorBase = 0.10 + this._cur * 0.42;
		const backBase = 0.04 + this._cur * 0.26;
		this._floorMat.opacity = Math.max(0, (floorBase + pulseBoost) * breathe);
		this._backMat.opacity = Math.max(0, (backBase + pulseBoost * 0.7) * breathe);
		// Pulse also briefly widens the floor pool.
		if (this._pulse > 0) {
			const k = 1 + this._pulse * this._pulseSign * 0.18;
			const fr = this._radius * 2.6 * k;
			this._floor.scale.set(fr, fr, 1);
		}
	}

	setVisible(v) {
		this.visible = !!v;
		this.object3D.visible = !!v;
	}

	dispose() {
		this._floorMat.dispose();
		this._backMat.dispose();
		this.object3D.parent?.remove(this.object3D);
		// The shared texture is intentionally NOT disposed (other auras may use it).
	}
}
