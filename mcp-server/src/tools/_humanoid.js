// Deterministic humanoid-prompt classifier — shared by the avatar tools.
//
// Auto-rigging is a paid GPU operation that only makes sense for a humanoid
// character: the UniRig pipeline fits a humanoid skeleton, and the three.ws
// canonical clip library (idle/walk) only retargets onto a humanoid rig. Rigging
// "a worn leather armchair" burns a paid call and yields a useless skeleton, so
// the avatar pipeline gates auto-rig on this check.
//
// It is a pure lexical heuristic on purpose: no network, no model call, zero
// added latency, and fully deterministic (the same prompt always classifies the
// same way — important for billing and tests). It reads the prompt the way the
// downstream skeleton fitter does — does this describe a character with a body
// plan a humanoid rig can drive? — and returns a confidence so callers can pick
// a threshold. It never throws; an empty or junk prompt yields a low-confidence
// non-humanoid verdict, which the caller treats as "don't auto-rig."

// Strong positive signals: words that almost always denote a humanoid figure.
// Matched as whole words (see WORD_RE) so "manifold" never trips "man".
const HUMANOID_TERMS = [
	'avatar', 'character', 'humanoid', 'human', 'person', 'people', 'figure',
	'man', 'woman', 'men', 'women', 'boy', 'girl', 'child', 'kid', 'lady', 'guy', 'dude',
	'male', 'female', 'hero', 'heroine', 'villain', 'warrior', 'soldier', 'knight',
	'wizard', 'mage', 'witch', 'ninja', 'samurai', 'pirate', 'viking', 'gladiator',
	'astronaut', 'cyborg', 'android', 'robot', 'mecha', 'mech', 'golem', 'zombie',
	'skeleton', 'mummy', 'vampire', 'werewolf', 'demon', 'angel', 'goddess', 'god',
	'elf', 'orc', 'goblin', 'dwarf', 'troll', 'fairy', 'gnome', 'centaur',
	'alien', 'monster', 'creature', 'mascot', 'doll', 'mannequin', 'statue',
	'king', 'queen', 'prince', 'princess', 'soldier', 'guard', 'monk', 'priest',
	'dancer', 'fighter', 'athlete', 'player', 'gamer', 'superhero', 'spaceman',
	'goku', 'anime', 'waifu', 'vtuber', 'npc', 'biped', 'bipedal',
];

// Body-part / pose cues — a prompt that mentions these describes something with
// a humanoid body plan even if it never names the figure directly
// (e.g. "a suit of armour with crossed arms standing on two legs").
const BODY_TERMS = [
	'arms', 'arm', 'legs', 'leg', 'torso', 'limbs', 'hands', 'hand', 'fingers',
	'shoulders', 'shoulder', 'hips', 'hip', 'spine', 'standing', 'walking',
	'posing', 'pose', 'running', 'sitting', 'two legs', 'upright', 'full body',
	'full-body', 'fullbody',
];

// Strong negatives: subjects that are emphatically NOT humanoid. Their presence
// pulls confidence down hard, so "a cute teapot character" (toy with a face but
// no body plan) doesn't get auto-rigged into a broken skeleton.
const NON_HUMANOID_TERMS = [
	'armchair', 'chair', 'sofa', 'couch', 'table', 'desk', 'lamp', 'vase',
	'teapot', 'mug', 'cup', 'bottle', 'bowl', 'plate', 'cutlery',
	'car', 'truck', 'vehicle', 'tank', 'plane', 'aircraft', 'jet', 'ship',
	'boat', 'rocket', 'spaceship', 'spacecraft', 'drone', 'bicycle', 'motorcycle',
	'building', 'house', 'tower', 'castle', 'bridge', 'temple', 'cathedral',
	'tree', 'plant', 'flower', 'rock', 'stone', 'mountain', 'terrain', 'landscape',
	'sword', 'shield', 'gun', 'rifle', 'pistol', 'axe', 'hammer', 'helmet', 'crown',
	'ring', 'necklace', 'coin', 'gem', 'crystal', 'potion', 'barrel', 'crate', 'chest',
	'food', 'burger', 'pizza', 'cake', 'fruit', 'apple', 'sneaker', 'shoe', 'boot',
	'logo', 'icon', 'emblem', 'sign', 'gear', 'engine', 'machine', 'turbine',
	'fish', 'bird', 'insect', 'butterfly', 'flower', 'mushroom', 'leaf',
];

// Animals are quadrupeds/other — a humanoid rig won't drive them. Kept separate
// because some are common ("dragon", "horse") and we want them firmly negative.
const ANIMAL_TERMS = [
	'dog', 'cat', 'horse', 'cow', 'pig', 'sheep', 'goat', 'lion', 'tiger', 'bear',
	'wolf', 'fox', 'deer', 'rabbit', 'mouse', 'rat', 'elephant', 'giraffe', 'zebra',
	'dragon', 'dinosaur', 'dino', 'snake', 'lizard', 'turtle', 'frog', 'shark',
	'whale', 'dolphin', 'octopus', 'crab', 'spider', 'bee', 'ant', 'horse',
	'eagle', 'owl', 'penguin', 'duck', 'chicken', 'cow', 'bull', 'ram',
];

function buildWordSet(terms) {
	// Multi-word terms ("two legs", "full body") are matched as substrings; the
	// single-word majority go in a Set for O(1) whole-word lookup.
	const single = new Set();
	const phrases = [];
	for (const t of terms) {
		if (t.includes(' ') || t.includes('-')) phrases.push(t);
		else single.add(t);
	}
	return { single, phrases };
}

const HUMANOID = buildWordSet(HUMANOID_TERMS);
const BODY = buildWordSet(BODY_TERMS);
const NON_HUMANOID = buildWordSet([...NON_HUMANOID_TERMS, ...ANIMAL_TERMS]);

// Split on any run of non-letter characters so punctuation, digits, and emoji
// never fuse into adjacent words. Lowercased for case-insensitive matching.
function tokenize(text) {
	return String(text || '')
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter(Boolean);
}

function countHits({ single, phrases }, tokens, lowerText) {
	let hits = 0;
	for (const tok of tokens) if (single.has(tok)) hits += 1;
	for (const p of phrases) if (lowerText.includes(p)) hits += 1;
	return hits;
}

/**
 * Classify whether a text prompt describes a humanoid figure worth auto-rigging.
 *
 * @param {string} prompt
 * @returns {{ humanoid: boolean, confidence: number, reason: string,
 *   signals: { humanoid: number, body: number, nonHumanoid: number } }}
 *   `confidence` is in [0,1]. `humanoid` is true when confidence ≥ 0.5.
 */
export function classifyHumanoidPrompt(prompt) {
	const text = String(prompt || '').toLowerCase().trim();
	const tokens = tokenize(text);

	if (tokens.length === 0) {
		return {
			humanoid: false,
			confidence: 0,
			reason: 'empty prompt',
			signals: { humanoid: 0, body: 0, nonHumanoid: 0 },
		};
	}

	const humanoidHits = countHits(HUMANOID, tokens, text);
	const bodyHits = countHits(BODY, tokens, text);
	const nonHits = countHits(NON_HUMANOID, tokens, text);

	const signals = { humanoid: humanoidHits, body: bodyHits, nonHumanoid: nonHits };

	// Base score: humanoid nouns count full, body cues count half (supporting,
	// not defining). A strong non-humanoid noun ("armchair", "dragon") subtracts
	// more than a body cue adds, so "dragon with two arms" stays non-humanoid.
	const positive = humanoidHits + bodyHits * 0.5;
	const negative = nonHits;
	const net = positive - negative * 1.25;

	// Map the net score onto [0,1] with a soft ramp. net ≤ 0 → ≤0.25 (the prompt
	// names a non-humanoid subject or nothing relevant); net 1 → ~0.6; net ≥ 2 →
	// ≥0.8. A bare object prompt with zero signals lands at exactly 0.25 — below
	// threshold, so the default for an ambiguous prompt is "don't rig."
	let confidence;
	if (net <= 0) {
		confidence = Math.max(0, 0.25 + net * 0.12);
	} else {
		confidence = Math.min(1, 0.4 + net * 0.2);
	}
	confidence = Math.round(confidence * 100) / 100;

	const humanoid = confidence >= 0.5;
	let reason;
	if (humanoid) {
		reason = `humanoid signals (${humanoidHits} figure, ${bodyHits} body) outweigh ${nonHits} non-humanoid`;
	} else if (nonHits > 0) {
		reason = `non-humanoid subject detected (${nonHits} signal${nonHits === 1 ? '' : 's'})`;
	} else {
		reason = 'no clear humanoid signal';
	}

	return { humanoid, confidence, reason, signals };
}

export default classifyHumanoidPrompt;
