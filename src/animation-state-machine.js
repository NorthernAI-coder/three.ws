// Animation state machine — replaces the flat clip list / hard-cut playback
// model with a small directed graph that picks the next clip when protocol
// events fire and crossfades between them.
//
// States are simple roles the avatar can be in (idle, talk, walk, react, emote).
// Each state maps to a single library clip name; the mapping is editable per
// agent so creators can swap in custom motion (e.g. "their idle is the dance
// clip"). Events fire transitions:
//
//   idle ─speak──► talk ─speak-end──► idle ─walk──► walk ─walk-end──► idle
//                                      ▲                                ▲
//                                      └─ react ◄─reaction-end──────────┘
//                                      └─ emote ◄──emote-end────────────┘
//
// `react` and `emote` are one-shots: they play once, then auto-fire their
// `-end` transition (driven externally by the caller calling fire('react-end')
// after the clip duration elapses — the machine itself is duration-agnostic).
//
// This module is pure: no Three.js, no DOM, no async. Playback side effects
// are delivered through a single `onTransition({ state, clip, crossfade })`
// callback supplied by the caller. That makes the state machine unit-testable
// without a render loop and reusable by anything that drives an avatar
// (the embed bundle, /app, future server-side previewers).

/** Built-in state definitions.
 *
 * `talk` defaults to the same clip as `idle` because the three.ws animation
 * library doesn't ship a dedicated talking-body loop and the live lip-sync
 * already animates the mouth. Agents that have a talking-body clip (e.g. a
 * subtle idle-2) override `states.talk.clip` via meta.animationGraph.
 */
const DEFAULT_STATES = Object.freeze({
	idle:  { clip: 'idle',     loop: true,  crossfade: 0.5,  oneShot: false, returnTo: null },
	talk:  { clip: 'idle',     loop: true,  crossfade: 0.35, oneShot: false, returnTo: null },
	walk:  { clip: 'walk',     loop: true,  crossfade: 0.3,  oneShot: false, returnTo: null },
	react: { clip: 'reaction', loop: false, crossfade: 0.25, oneShot: true,  returnTo: 'idle' },
	emote: { clip: 'wave',     loop: false, crossfade: 0.25, oneShot: true,  returnTo: 'idle' },
});

/** Built-in event → target-state transition table. */
const DEFAULT_TRANSITIONS = Object.freeze({
	'speak':       'talk',
	'speak-end':   'idle',
	'walk':        'walk',
	'walk-end':    'idle',
	'react':       'react',
	'react-end':   'idle',
	'emote':       'emote',
	'emote-end':   'idle',
});

const STATE_NAMES = Object.freeze(Object.keys(DEFAULT_STATES));

export { DEFAULT_STATES, DEFAULT_TRANSITIONS, STATE_NAMES };

/**
 * @typedef {Object} StateDef
 * @property {string}        clip         - library clip name to play in this state
 * @property {boolean}       loop         - whether the clip loops
 * @property {number}        crossfade    - seconds to crossfade in
 * @property {boolean}       oneShot      - if true, the state auto-resolves to `returnTo` after playback
 * @property {string|null}   returnTo     - state to return to after a one-shot (idle by default)
 */

/**
 * @typedef {Object} AnimationGraph
 * @property {Object<string,Partial<StateDef>>} [states]       - per-state overrides (defaults filled in)
 * @property {Object<string,string>}            [transitions]  - event → target-state overrides
 * @property {string}                           [initial]      - starting state, defaults to "idle"
 */

export class AnimationStateMachine {
	/**
	 * @param {AnimationGraph}  [graph]
	 * @param {(payload: {state: string, def: StateDef, clip: string, crossfade: number}) => void} [onTransition]
	 *   Called every time the current state changes. The caller wires this to the
	 *   actual animation playback (e.g. `viewer.animationManager.crossfadeTo(clip, crossfade)`).
	 */
	constructor(graph = {}, onTransition = null) {
		this.states      = mergeStates(graph.states);
		this.transitions = mergeTransitions(graph.transitions);
		this.initial     = graph.initial && this.states[graph.initial] ? graph.initial : 'idle';
		this.current     = this.initial;
		this.onTransition = typeof onTransition === 'function' ? onTransition : null;
		// History of one-shot returns. A `react` fired during a `talk` should
		// return to `talk` afterwards, not blindly to `idle`. We keep a small
		// stack so nested one-shots compose cleanly.
		this._returnStack = [];
	}

	/** Current state name (e.g. "idle", "talk"). */
	getCurrent() { return this.current; }

	/** Current state's clip name from its definition. */
	getCurrentClip() { return this.states[this.current]?.clip ?? null; }

	/**
	 * Fire a transition. Returns the new state name (which may equal the old
	 * if no edge matched), or null if the machine has no clip for the target.
	 * @param {string} event
	 * @returns {string|null}
	 */
	fire(event) {
		if (!event || typeof event !== 'string') return null;

		// Special case: every state has an implicit "<state-name>" event that
		// transitions directly into it (e.g. fire('walk') always goes to walk).
		const target = this.transitions[event] || (this.states[event] ? event : null);
		if (!target) return null;

		const targetDef = this.states[target];
		if (!targetDef || !targetDef.clip) return null;

		// If the new state is a one-shot, remember where to return so we can
		// resume the long-running state (talk / walk) afterwards.
		const fromDef = this.states[this.current];
		if (targetDef.oneShot && fromDef && !fromDef.oneShot) {
			this._returnStack.push(this.current);
		}

		// "*-end" transitions resolve to the return stack if there's one, falling
		// back to the configured returnTo / initial.
		const isEndEvent = event.endsWith('-end');
		let resolvedTarget = target;
		if (isEndEvent && this._returnStack.length > 0) {
			const popped = this._returnStack.pop();
			if (this.states[popped]) resolvedTarget = popped;
		}

		if (resolvedTarget === this.current) return this.current;

		const def = this.states[resolvedTarget];
		this.current = resolvedTarget;
		if (this.onTransition) {
			try {
				this.onTransition({
					state: resolvedTarget,
					def,
					clip: def.clip,
					crossfade: def.crossfade,
				});
			} catch (err) {
				console.warn('[AnimationStateMachine] onTransition threw:', err);
			}
		}
		return resolvedTarget;
	}

	/** Reset to the initial state and clear any pending returns. */
	reset() {
		this._returnStack.length = 0;
		this.current = this.initial;
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mergeStates(overrides) {
	const out = {};
	for (const name of STATE_NAMES) {
		const def = { ...DEFAULT_STATES[name] };
		const o = overrides && overrides[name];
		if (o && typeof o === 'object') {
			if (typeof o.clip === 'string' && o.clip.length > 0) def.clip = o.clip;
			if (typeof o.loop === 'boolean') def.loop = o.loop;
			if (typeof o.crossfade === 'number' && Number.isFinite(o.crossfade)) {
				def.crossfade = Math.max(0, Math.min(5, o.crossfade));
			}
			if (typeof o.oneShot === 'boolean') def.oneShot = o.oneShot;
			if (typeof o.returnTo === 'string' || o.returnTo === null) def.returnTo = o.returnTo;
		}
		out[name] = def;
	}
	// Allow custom user-defined states beyond the built-ins.
	if (overrides && typeof overrides === 'object') {
		for (const [name, o] of Object.entries(overrides)) {
			if (out[name] || !o || typeof o !== 'object' || !o.clip) continue;
			out[name] = {
				clip:      o.clip,
				loop:      o.loop ?? false,
				crossfade: typeof o.crossfade === 'number' ? Math.max(0, Math.min(5, o.crossfade)) : 0.25,
				oneShot:   o.oneShot ?? true,
				returnTo:  typeof o.returnTo === 'string' ? o.returnTo : 'idle',
			};
		}
	}
	return out;
}

function mergeTransitions(overrides) {
	const out = { ...DEFAULT_TRANSITIONS };
	if (overrides && typeof overrides === 'object') {
		for (const [event, target] of Object.entries(overrides)) {
			if (typeof event === 'string' && typeof target === 'string') {
				out[event] = target;
			}
		}
	}
	return out;
}
