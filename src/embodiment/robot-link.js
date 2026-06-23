// RobotLink — the transport-abstracted link between a three.ws agent (a mind)
// and one physical or simulated body. This is the FIXED interface every other
// Embodiment task builds on; adapters implement one shape and the rest of the
// platform never learns which transport is underneath.
//
// A RobotLink is bound to exactly one agentId + one bodyId at a time. It owns:
//   • the concrete adapter (resolved lazily by transport, so heavy/DOM-bound or
//     Node-incompatible adapters never load until actually used — tests and the
//     server can import this module freely),
//   • the connection lifecycle (connect with bounded backoff; a DEFINED SAFE
//     STATE on any disconnect/fault — motors released, driving halted),
//   • a deny-by-default capability gate (Task 07 hardens the policy; the gate
//     itself lives here so no command reaches a motor without an allowed
//     capability),
//   • bus emission for every state change, on the ONE shared nervous system.
//
// Adapter contract (see BaseRobotAdapter): an adapter is a plain object/instance
// exposing:
//   transport: string
//   async connect(): void                       — establish the link
//   async disconnect(): void                     — tear down cleanly
//   async getTelemetry(): TelemetrySample        — REAL device/sim state only
//   async setJoints(map): void                   — { jointName: radians }
//   async playClip(name, opts): void             — named clip / posture
//   async setFace(frame): void                   — viseme/morph frame (Task 04)
//   async speak(audio): void                     — audio payload (Task 02/04)
//   camera(): MediaStream|AsyncIterable|null      — video source (Task 06)
//   async estop(): void                          — hard stop → safe state
// Every method except estop()/disconnect()/getTelemetry() may reject with a
// CapabilityError when the binding hasn't granted the matching capability.

import {
	emitRobotLinked,
	emitRobotUnlinked,
	emitRobotTelemetry,
	emitRobotFault,
	emitMotionPlayed,
	emitFaceExpressed,
	emitEstop,
} from './embodiment-bus.js';

/** Thrown when a command needs a capability the binding didn't grant. */
export class CapabilityError extends Error {
	constructor(capability) {
		super(`embodiment: capability "${capability}" not granted for this body`);
		this.name = 'CapabilityError';
		this.code = 'capability_denied';
		this.capability = capability;
	}
}

/** Thrown when a command is issued while the link isn't connected/active. */
export class LinkStateError extends Error {
	constructor(state) {
		super(`embodiment: link is "${state}" — not ready for commands`);
		this.name = 'LinkStateError';
		this.code = 'link_not_ready';
		this.state = state;
	}
}

// transport → async () => factory(fn). Lazy so an adapter's deps (three.js for
// the simulator, WebRTC/RPC for hardware) load only when that transport is used.
const ADAPTER_LOADERS = {
	simulator: () => import('./sim-adapter.js').then((m) => m.createSimAdapter),
	'webrtc-ros2': () => import('./webrtc-adapter.js').then((m) => m.createWebrtcAdapter),
};

/**
 * Register (or override) an adapter loader for a transport. Tests register an
 * in-memory adapter here; new hardware transports register their loader at
 * import time. The loader returns a factory `(opts) => adapter`.
 */
export function registerAdapter(transport, loader) {
	if (!transport || typeof loader !== 'function') {
		throw new TypeError('registerAdapter(transport, loader) requires a transport and a loader fn');
	}
	ADAPTER_LOADERS[transport] = loader;
}

/** Transports that currently have a registered adapter loader. */
export function knownTransports() {
	return Object.keys(ADAPTER_LOADERS);
}

/**
 * Which transports are actually usable right now. `simulator` is always usable
 * (the on-screen twin). A hardware transport is reported only when its bridge is
 * really reachable per config — never advertised when it would be faked.
 * @param {{ bridgeUrl?: string }} [env]
 * @returns {string[]}
 */
export function probeAvailableTransports(env = {}) {
	const out = ['simulator'];
	const bridgeUrl =
		env.bridgeUrl ||
		(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ROBOT_BRIDGE_URL) ||
		(typeof globalThis !== 'undefined' && globalThis.__THREEWS_ROBOT_BRIDGE_URL) ||
		null;
	if (bridgeUrl) out.unshift('webrtc-ros2');
	return out;
}

const DEFAULT_CAPABILITIES = Object.freeze({ move: false, face: false, speak: false, leaveRoom: false });
// The simulator twin can't injure anyone, so it boots fully capable; hardware
// transports stay deny-by-default until the owner grants scope (Task 05/07).
const SIM_CAPABILITIES = Object.freeze({ move: true, face: true, speak: true, leaveRoom: false });

const MAX_RECONNECT_DELAY_MS = 15_000;
const BASE_RECONNECT_DELAY_MS = 500;

export class RobotLink {
	/**
	 * @param {{ agentId: string, bodyId: string, transport: string,
	 *   adapter: object, capabilities?: object, label?: string,
	 *   telemetryIntervalMs?: number }} opts
	 */
	constructor({ agentId, bodyId, transport, adapter, capabilities, label, telemetryIntervalMs = 4000 }) {
		if (!agentId) throw new Error('RobotLink requires an agentId');
		if (!bodyId) throw new Error('RobotLink requires a bodyId');
		if (!adapter) throw new Error('RobotLink requires a resolved adapter');
		this.agentId = agentId;
		this.bodyId = bodyId;
		this.transport = transport;
		this.label = label || bodyId;
		this._adapter = adapter;
		this._capabilities = {
			...DEFAULT_CAPABILITIES,
			...(transport === 'simulator' ? SIM_CAPABILITIES : {}),
			...(capabilities || {}),
		};
		/** 'idle' | 'connecting' | 'active' | 'fault' | 'closed' */
		this.state = 'idle';
		this._telemetryIntervalMs = telemetryIntervalMs;
		this._telemetryTimer = null;
		this._lastTelemetry = null;
		this._closing = false;
	}

	get capabilities() {
		return { ...this._capabilities };
	}

	/** Update the granted capability scope (Task 05 grant / Task 07 policy). */
	setCapabilities(patch) {
		this._capabilities = { ...this._capabilities, ...(patch || {}) };
		return this.capabilities;
	}

	can(capability) {
		return this._capabilities[capability] === true;
	}

	_require(capability) {
		if (!this.can(capability)) throw new CapabilityError(capability);
		if (this.state !== 'active') throw new LinkStateError(this.state);
	}

	/**
	 * Establish the link. Emits `robot:linked` on success. On failure the link is
	 * left in its safe state and the error is rethrown for the caller to surface.
	 * @param {{ onchain?: object|null }} [meta] - on-chain binding proof for the event
	 */
	async connect(meta = {}) {
		if (this.state === 'active') return this;
		this.state = 'connecting';
		await this._adapter.connect();
		this.state = 'active';
		this._closing = false;
		// Wire the adapter's own fault signal (lost link, hardware fault) to our
		// safe-state path so a drop from the device side is handled identically to
		// one we detect.
		if (typeof this._adapter.onFault === 'function') {
			this._adapter.onFault((code, detail) => this._enterFault(code, detail));
		}
		emitRobotLinked({
			agentId: this.agentId,
			bodyId: this.bodyId,
			transport: this.transport,
			label: this.label,
			onchain: meta.onchain || null,
		});
		return this;
	}

	/** Begin polling REAL telemetry and emitting `robot:telemetry`. Idempotent. */
	startTelemetry() {
		if (this._telemetryTimer || typeof setInterval !== 'function') return;
		const tick = async () => {
			if (this.state !== 'active') return;
			try {
				const sample = await this._adapter.getTelemetry();
				this._lastTelemetry = sample;
				emitRobotTelemetry({ agentId: this.agentId, bodyId: this.bodyId, ...sample });
				// A device that reports a fault in telemetry trips the safe state.
				if (sample && Array.isArray(sample.faults) && sample.faults.length) {
					this._enterFault('telemetry_fault', sample.faults.join(', '));
				}
			} catch (err) {
				this._enterFault('telemetry_unreachable', err?.message || 'telemetry read failed');
			}
		};
		this._telemetryTimer = setInterval(tick, this._telemetryIntervalMs);
		tick();
	}

	stopTelemetry() {
		if (this._telemetryTimer) {
			clearInterval(this._telemetryTimer);
			this._telemetryTimer = null;
		}
	}

	lastTelemetry() {
		return this._lastTelemetry;
	}

	/** Drive joints (radians per joint name). Requires `move`. */
	async setJoints(map) {
		this._require('move');
		await this._adapter.setJoints(map);
		emitMotionPlayed({ agentId: this.agentId, bodyId: this.bodyId, source: 'pose' });
	}

	/** Play a named clip / posture. Requires `move`. */
	async playClip(name, opts = {}) {
		this._require('move');
		await this._adapter.playClip(name, opts);
		emitMotionPlayed({ agentId: this.agentId, bodyId: this.bodyId, clip: name, source: 'clip' });
	}

	/** Render a face/expression/viseme frame. Requires `face`. */
	async setFace(frame) {
		this._require('face');
		await this._adapter.setFace(frame);
		emitFaceExpressed({
			agentId: this.agentId,
			bodyId: this.bodyId,
			expression: frame?.expression,
			viseme: frame?.viseme,
		});
	}

	/** Speak an audio payload through the body. Requires `speak`. */
	async speak(audio) {
		this._require('speak');
		await this._adapter.speak(audio);
	}

	/** The body's camera stream/source, or null. No capability gate on observe. */
	camera() {
		return typeof this._adapter.camera === 'function' ? this._adapter.camera() : null;
	}

	/**
	 * Hard emergency stop — always allowed, no capability/state gate. Drives the
	 * body to its safe state, halts telemetry, and announces on the bus. Survives
	 * an adapter that throws (we still mark fault and emit) so the kill path is
	 * never blocked by the thing it's killing.
	 */
	async estop(source = 'user') {
		this.stopTelemetry();
		try {
			await this._adapter.estop();
		} catch (err) {
			console.error('[robot-link] adapter estop threw — forcing safe state', err);
		}
		this.state = 'fault';
		emitEstop({ agentId: this.agentId, bodyId: this.bodyId, source });
		emitRobotFault({
			agentId: this.agentId,
			bodyId: this.bodyId,
			code: 'estop',
			detail: `e-stop (${source})`,
			safeState: true,
		});
	}

	/** Release the body cleanly. Emits `robot:unlinked`. */
	async disconnect(reason = 'user') {
		this._closing = true;
		this.stopTelemetry();
		try {
			await this._adapter.disconnect();
		} catch (err) {
			console.error('[robot-link] adapter disconnect threw', err);
		}
		this.state = 'closed';
		emitRobotUnlinked({ agentId: this.agentId, bodyId: this.bodyId, reason });
	}

	// Transition into the safe/fault state from any detected problem. Idempotent
	// and never throws — this is the floor the whole system falls back to.
	_enterFault(code, detail) {
		if (this.state === 'fault' || this.state === 'closed') return;
		this.state = 'fault';
		this.stopTelemetry();
		// Best-effort: ask the adapter to assume its safe state.
		Promise.resolve()
			.then(() => this._adapter.estop?.())
			.catch(() => {});
		emitRobotFault({ agentId: this.agentId, bodyId: this.bodyId, code, detail, safeState: true });
	}
}

/**
 * Resolve the adapter for a transport and construct a (not-yet-connected)
 * RobotLink. Call `.connect()` to establish the link.
 *
 * @param {{ agentId: string, bodyId: string, transport: string,
 *   capabilities?: object, label?: string, adapterOptions?: object,
 *   telemetryIntervalMs?: number }} opts
 * @returns {Promise<RobotLink>}
 */
export async function createRobotLink(opts) {
	const { transport } = opts;
	const loader = ADAPTER_LOADERS[transport];
	if (!loader) {
		throw new Error(
			`embodiment: no adapter for transport "${transport}". Known: ${knownTransports().join(', ')}`,
		);
	}
	const factory = await loader();
	const adapter = await factory({
		agentId: opts.agentId,
		bodyId: opts.bodyId,
		...(opts.adapterOptions || {}),
	});
	return new RobotLink({ ...opts, adapter });
}

/**
 * A minimal base an adapter can extend for the optional `onFault` plumbing and
 * sane no-op defaults for capabilities a given body doesn't have. Concrete
 * adapters override the methods their hardware/sim actually supports.
 */
export class BaseRobotAdapter {
	constructor({ transport, bodyId } = {}) {
		this.transport = transport;
		this.bodyId = bodyId;
		this._faultHandlers = new Set();
	}
	onFault(handler) {
		this._faultHandlers.add(handler);
		return () => this._faultHandlers.delete(handler);
	}
	_fault(code, detail) {
		for (const h of this._faultHandlers) {
			try {
				h(code, detail);
			} catch {
				/* a fault handler that throws must not block the others */
			}
		}
	}
	async connect() {}
	async disconnect() {}
	async getTelemetry() {
		return { simulated: true };
	}
	async setJoints() {}
	async playClip() {}
	async setFace() {}
	async speak() {}
	camera() {
		return null;
	}
	async estop() {}
}

export default RobotLink;
