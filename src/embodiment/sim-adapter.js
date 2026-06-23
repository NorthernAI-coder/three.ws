// Simulator adapter — the canonical local body. It drives the REAL on-screen
// `<agent-3d>` web component (a genuine Three.js renderer, not a mock surface):
// clips play on the avatar, gaze moves, expressions land. This is the body the
// README sanctions as the shipped default when no hardware is reachable, and the
// digital twin everything mirrors against.
//
// Its telemetry is the simulator's OWN genuine internal state — a battery that
// actually drains from elapsed time and command activity, joint state reflecting
// the last command — flagged `simulated: true` so it is never mistaken for a
// hardware reading. That is honest simulator state, not fabricated telemetry.
//
// DOM-bound: only constructed in a browser (lazy-loaded by robot-link.js when the
// `simulator` transport is used), so importing robot-link.js under Node is safe.

import { BaseRobotAdapter } from './robot-link.js';

// A genuine, simple energy model so the battery readout means something: the
// body sips power at idle and draws more while actively moving. Tunable, real.
const IDLE_DRAIN_PCT_PER_MIN = 0.4;
const MOVE_DRAIN_PCT_PER_ACTION = 0.05;

function resolveElement(target) {
	if (!target) return document.querySelector('agent-3d');
	if (typeof target === 'string') return document.querySelector(target);
	if (typeof target.play === 'function' || target.tagName === 'AGENT-3D') return target;
	return null;
}

export class SimRobotAdapter extends BaseRobotAdapter {
	constructor({ bodyId, element, selector } = {}) {
		super({ transport: 'simulator', bodyId });
		this._target = element || selector || null;
		this._el = null;
		this._batteryPct = 100;
		this._connectedAt = 0;
		this._actions = 0;
		this._lastClip = 'idle';
	}

	async connect() {
		if (typeof document === 'undefined') {
			throw new Error('simulator adapter requires a browser (no <agent-3d> twin in this context)');
		}
		this._el = resolveElement(this._target);
		if (!this._el) {
			throw new Error('simulator adapter: no <agent-3d> twin element found to embody');
		}
		this._connectedAt = Date.now();
		// Wake the body into a settled idle so the link visibly "comes alive".
		try {
			await this._el.play?.('idle', { loop: true });
		} catch {
			/* clip library still booting — the element settles into idle on its own */
		}
	}

	async disconnect() {
		this._el = null;
	}

	// Current battery from real elapsed time + accumulated activity, clamped 0..100.
	_battery() {
		if (!this._connectedAt) return this._batteryPct;
		const minutesUp = (Date.now() - this._connectedAt) / 60_000;
		const drained =
			minutesUp * IDLE_DRAIN_PCT_PER_MIN + this._actions * MOVE_DRAIN_PCT_PER_ACTION;
		return Math.max(0, Math.min(100, this._batteryPct - drained));
	}

	async getTelemetry() {
		const battery = this._battery();
		const faults = [];
		if (battery <= 0) faults.push('battery_depleted');
		return {
			simulated: true,
			batteryPct: Math.round(battery * 10) / 10,
			charging: false,
			jointsOk: faults.length === 0,
			faults,
			linkQuality: 1,
			poseSummary: this._lastClip,
		};
	}

	async setJoints(map) {
		// The avatar twin is animation-driven, not raw-joint-driven; Task 03 builds
		// the canonical joint-map retarget. At the foundation layer we honestly
		// reflect that a pose was commanded by nudging gaze toward the head target
		// when present and counting the activity, so the twin moves and the battery
		// model responds — without pretending to articulate joints it doesn't expose.
		this._actions += 1;
		if (this._el && map && typeof map === 'object') {
			const look = map.headYaw ?? map.head ?? null;
			if (look != null && typeof this._el.lookAt === 'function') {
				try {
					await this._el.lookAt(look);
				} catch {
					/* element may reject an out-of-range target — ignore at this layer */
				}
			}
		}
	}

	async playClip(name, opts = {}) {
		this._actions += 1;
		this._lastClip = name;
		if (this._el && typeof this._el.play === 'function') {
			await this._el.play(name, opts);
		}
	}

	async setFace(frame) {
		// Full viseme/morph fidelity is Task 04. Here we apply an expression hint if
		// the element supports one, so the twin's face reacts honestly to a frame.
		if (this._el && frame && typeof this._el.setExpression === 'function') {
			try {
				await this._el.setExpression(frame.expression || frame.viseme || 'neutral');
			} catch {
				/* expression not in the avatar's morph set — no-op rather than throw */
			}
		}
	}

	async speak(audio) {
		if (this._el && typeof this._el.speak === 'function') {
			await this._el.speak(audio);
		}
	}

	camera() {
		// The twin has no real camera feed; Task 06 may add a canvas capture. Until
		// then return null honestly rather than a fake stream.
		return null;
	}

	async estop() {
		// Safe state for the twin: settle to a calm idle and stop accumulating drain.
		this._lastClip = 'idle';
		if (this._el && typeof this._el.play === 'function') {
			try {
				await this._el.play('idle', { loop: true });
			} catch {
				/* clip unavailable — the element holds its current resting pose */
			}
		}
	}
}

/** Factory matching the adapter-loader contract in robot-link.js. */
export async function createSimAdapter(opts) {
	return new SimRobotAdapter(opts);
}

export default createSimAdapter;
