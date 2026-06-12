// Forge prompt studio — the text-mode authoring aids that sit under the
// composer: a curated prompt library behind "Surprise me" and "More ideas",
// a live prompt coach that grades what you typed against how the model
// actually reconstructs, and an honest character counter.
//
// All client-side. The library is hand-authored product content (single
// isolated subjects with material/lighting cues — the shape Forge meshes
// cleanest), not sampled data, and nothing here fakes a network call.

const MAXLEN = 1000;

// Curated starters — every one is a single, isolated object with a material
// and/or lighting cue, mirroring the guidance in the Forge FAQ. Grouped only
// for authoring clarity; consumed as one flat pool.
const LIBRARY = [
	// Creatures & characters
	'a low-poly red fox, sitting, soft studio light',
	'a chubby axolotl, glossy pink skin, plain background',
	'a tiny brass clockwork owl, polished metal',
	'a stone golem, mossy granite, weathered',
	'a cartoon astronaut, matte white suit, neutral pose',
	'a porcelain rabbit figurine, glazed, soft shadows',
	'a wooden articulated artist mannequin, light oak',
	'a plush felt dinosaur toy, stitched seams',
	// Props & objects
	'a vintage film camera, brushed aluminium and black leather',
	'a glazed ceramic teapot, cobalt blue, studio lighting',
	'a worn leather armchair, studio lighting, plain background',
	'an antique brass compass, weathered patina',
	'a mechanical keyboard, translucent keycaps, backlit',
	'a hand-forged iron axe, dark steel, leather grip',
	'a crystal perfume bottle, faceted glass, gold cap',
	'a retro rotary telephone, cream bakelite',
	'a stack of hardcover books, aged cloth binding',
	'a wireless over-ear headphone, matte charcoal',
	'a single running shoe, knit upper, rubber sole',
	'a brass desk lamp, articulated arm, enamel shade',
	'a treasure chest, dark wood and tarnished iron bands',
	'an espresso machine, stainless steel and chrome',
	// Nature & food
	'a potted monstera plant, terracotta pot',
	'a bonsai juniper in a shallow stone tray',
	'a glazed donut with sprinkles, soft studio light',
	'a ripe pomegranate, split open, glossy seeds',
	'a cluster of amethyst crystals on raw rock',
	'a single autumn maple leaf, deep amber',
	'a honey jar with wooden dipper, warm light',
	'a coral fan, calcified white, plain background',
	// Sci-fi & fantasy
	'a sci-fi combat helmet, brushed metal, scuffed paint',
	'a glowing mana potion in a corked vial, teal liquid',
	'a hovering recon drone, white plastic and carbon fibre',
	'a wizard staff, gnarled oak with an embedded gem',
	'a retro ray gun, chrome with red accents',
	'an enchanted spellbook, leather cover, brass clasp',
	'a modular space station segment, white panels',
	'a knight helm, dark polished steel, plumed crest',
	// Vehicles & architecture
	'a low-poly camper van, pastel teal paint',
	'a wooden sailboat model, white canvas sails',
	'a vintage scooter, mint green, chrome trim',
	'a small lighthouse, red and white stripes',
	'a cozy mushroom cottage, thatched roof',
	'a hot air balloon, striped canvas, wicker basket',
];

const $ = (id) => document.getElementById(id);

const els = {
	prompt: $('prompt'),
	surprise: $('surprise'),
	coach: $('prompt-coach'),
	count: $('prompt-count'),
	examples: $('examples'),
	chipsMore: $('chips-more'),
};

// Heuristic lexicons used by the coach. These describe how TRELLIS-style
// reconstruction behaves: a named material/finish and a clean isolated
// subject produce the sharpest mesh; scenes and multi-object prompts
// compress poorly into a single mesh.
const MATERIAL_WORDS = [
	'metal',
	'metallic',
	'brass',
	'bronze',
	'copper',
	'steel',
	'iron',
	'chrome',
	'aluminium',
	'aluminum',
	'gold',
	'silver',
	'ceramic',
	'porcelain',
	'glazed',
	'glass',
	'crystal',
	'wood',
	'wooden',
	'oak',
	'leather',
	'plastic',
	'rubber',
	'matte',
	'glossy',
	'polished',
	'brushed',
	'velvet',
	'felt',
	'stone',
	'marble',
	'granite',
	'concrete',
	'fabric',
	'knit',
	'enamel',
	'carbon fibre',
	'carbon fiber',
	'bakelite',
	'terracotta',
	'weathered',
	'rusted',
	'patina',
];
const LIGHT_WORDS = ['studio', 'lighting', 'light', 'backlit', 'soft shadows', 'soft light', 'neutral'];
// Signals that the prompt is asking for a scene rather than one object.
const SCENE_WORDS = [
	'scene',
	'landscape',
	'environment',
	'diorama',
	'room',
	'interior',
	'forest',
	'city',
	'street',
	'battlefield',
	'background of',
	'surrounded by',
];

function hasAny(text, words) {
	return words.some((w) => text.includes(w));
}

// Count subjects loosely — an " and " joining two nouns, or several
// comma-separated clauses, both push the model toward a multi-object mesh.
function looksMultiSubject(text) {
	if (hasAny(text, SCENE_WORDS)) return true;
	if (/\b(two|three|four|several|a group of|a pair of|a set of)\b/.test(text)) return true;
	// " x and y " where both sides carry a noun-ish token.
	if (/\w+\s+and\s+\w+/.test(text) && !/black and white|red and white|salt and pepper/.test(text))
		return true;
	return false;
}

function grade(raw) {
	const text = raw.trim().toLowerCase();
	const words = text ? text.split(/\s+/).length : 0;

	if (!text) {
		return {
			grade: 'tip',
			msg: 'Name one object and a material — e.g. “a brass compass, weathered”.',
		};
	}
	if (words < 2) {
		return { grade: 'tip', msg: 'Add a little detail — a material, colour, or finish.' };
	}
	if (looksMultiSubject(text)) {
		return {
			grade: 'warn',
			msg: 'One isolated object reconstructs cleanest — scenes and multiple subjects compress poorly.',
		};
	}
	const material = hasAny(text, MATERIAL_WORDS);
	const light = hasAny(text, LIGHT_WORDS);
	if (material && light) {
		return { grade: 'strong', msg: 'Strong prompt — clear subject, material and lighting cues.' };
	}
	if (material) {
		return { grade: 'strong', msg: 'Good prompt — add “studio lighting” for an even cleaner bake.' };
	}
	return {
		grade: 'tip',
		msg: 'Add a material or finish — “matte ceramic”, “brushed brass” — for a sharper mesh.',
	};
}

function updateCoach() {
	if (!els.prompt) return;
	const value = els.prompt.value;
	if (els.coach) {
		const { grade: g, msg } = grade(value);
		els.coach.dataset.grade = g;
		els.coach.textContent = msg;
	}
	if (els.count) {
		const len = value.length;
		els.count.textContent = `${len} / ${MAXLEN}`;
		els.count.dataset.near = String(len >= MAXLEN - 100);
	}
}

// Random pick(s) from the library, avoiding a given set of current values so
// "Surprise me" and "More ideas" never echo what is already on screen.
function pickDistinct(count, avoid = new Set()) {
	const pool = LIBRARY.filter((p) => !avoid.has(p));
	const out = [];
	while (out.length < count && pool.length) {
		const i = Math.floor(Math.random() * pool.length);
		out.push(pool.splice(i, 1)[0]);
	}
	return out;
}

function surprise() {
	if (!els.prompt) return;
	const [pick] = pickDistinct(1, new Set([els.prompt.value.trim()]));
	if (!pick) return;
	els.prompt.value = pick;
	updateCoach();
	els.prompt.focus();
	const end = els.prompt.value.length;
	els.prompt.setSelectionRange(end, end);
	els.surprise?.classList.remove('is-rolling');
	// reflow so the animation restarts on rapid clicks
	void els.surprise?.offsetWidth;
	els.surprise?.classList.add('is-rolling');
}

function shuffleChips() {
	if (!els.examples) return;
	const chips = [...els.examples.querySelectorAll('.chip')];
	if (!chips.length) return;
	const current = new Set(chips.map((c) => c.textContent.trim()));
	const fresh = pickDistinct(chips.length, current);
	chips.forEach((chip, i) => {
		const next = fresh[i];
		if (!next) return;
		chip.classList.add('is-swapping');
	});
	const swap = () => {
		chips.forEach((chip, i) => {
			if (fresh[i]) chip.textContent = fresh[i];
			chip.classList.remove('is-swapping');
		});
	};
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) swap();
	else setTimeout(swap, 180);
	els.chipsMore?.classList.remove('is-rolling');
	void els.chipsMore?.offsetWidth;
	els.chipsMore?.classList.add('is-rolling');
}

if (els.prompt) {
	els.prompt.addEventListener('input', updateCoach);
	els.surprise?.addEventListener('click', surprise);
	els.chipsMore?.addEventListener('click', shuffleChips);
	// Reflect any value already present (remix ?prompt= prefill, restored draft).
	updateCoach();
}
