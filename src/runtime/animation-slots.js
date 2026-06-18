// Fixed slot vocabulary for agent animation gestures.
// Each slot maps to a clip name from the loaded animation library.
// Agents can override individual slots via meta.edits.animations.

export const SLOTS = [
	'idle',
	'wave',
	'nod',
	'shake',
	'think',
	'celebrate',
	'concern',
	'bow',
	'point',
	'shrug',
	'fidget',
	'dance',
];

export const DEFAULT_ANIMATION_MAP = {
	idle: 'idle',
	wave: 'reaction',
	nod: 'reaction',
	shake: 'angry',
	// Thinking/curiosity is a calm state, not a full-body action. The previous
	// 'pray' clip knelt the avatar to the ground, which read as the character
	// being dropped in (and praying) every time it loaded — the first-encounter
	// curiosity burst fires this slot on every fresh mount. Map it to a no-op
	// idle so curiosity is conveyed by gaze + facial morphs, never a kneel.
	think: 'idle',
	celebrate: 'celebrate',
	concern: 'defeated',
	bow: 'sitclap',
	point: 'reaction',
	shrug: 'defeated',
	fidget: 'Fidget',
	dance: 'rumba',
};

/**
 * Resolve a slot name to a concrete animation clip name.
 * Checks the agent's override map first, falls back to DEFAULT_ANIMATION_MAP,
 * then returns the slot name itself as a last resort.
 * @param {string} slot
 * @param {Object|null} overrideMap — agent's meta.edits.animations
 * @returns {string}
 */
export function resolveSlot(slot, overrideMap) {
	if (overrideMap && overrideMap[slot]) return overrideMap[slot];
	return DEFAULT_ANIMATION_MAP[slot] ?? slot;
}
