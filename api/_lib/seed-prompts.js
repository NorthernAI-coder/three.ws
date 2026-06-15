// @ts-check
// Curated prompt pool for the forge auto-seed cron. Every prompt is tuned for
// the FLUX text→image → TRELLIS image→3D pipeline: a single clear subject with
// a strong silhouette, no flat backgrounds, draft-quality friendly geometry.
//
// Two categories: 'avatar' (humanoid characters) and 'accessory' (items those
// characters carry or wear). The cron alternates so the gallery builds a
// coherent character ecosystem rather than a pile of identical knights.

/** @typedef {{ prompt: string, category: 'avatar' | 'accessory', theme: string }} SeedPrompt */

/** @type {SeedPrompt[]} */
export const SEED_PROMPTS = [
	// ── AVATARS ──────────────────────────────────────────────────────────────

	// Fantasy warriors
	{ prompt: 'a bulky armored knight in ornate silver plate armor with a red-plumed helmet, standing pose, game character', category: 'avatar', theme: 'knight' },
	{ prompt: 'a golden paladin in shining armor adorned with sun motifs and a long white cape, heroic pose', category: 'avatar', theme: 'paladin' },
	{ prompt: 'a dark knight in jet-black spiked armor with glowing red eye slits in the visor', category: 'avatar', theme: 'dark-knight' },
	{ prompt: 'a female valkyrie warrior in silver winged helmet and chainmail, holding a spear upright', category: 'avatar', theme: 'valkyrie' },
	{ prompt: 'a rugged viking warrior with a braided beard, fur-trimmed armor and battle axe on shoulder', category: 'avatar', theme: 'viking' },
	{ prompt: 'a roman centurion in red crested helmet and segmented lorica segmentata armor', category: 'avatar', theme: 'roman' },
	{ prompt: 'a samurai warrior in full black lacquered o-yoroi armor with a red kabuto helmet', category: 'avatar', theme: 'samurai' },
	{ prompt: 'a ninja in dark grey shinobi shozoku with twin katana strapped to the back', category: 'avatar', theme: 'ninja' },
	{ prompt: 'a gladiator fighter wearing a manica arm guard, crested helmet and carrying a round shield', category: 'avatar', theme: 'gladiator' },
	{ prompt: 'a crusader knight in white tabard with a red cross, full plate armor and kite shield', category: 'avatar', theme: 'crusader' },

	// Fantasy mages & casters
	{ prompt: 'an elderly wizard in long purple robes with silver stars, a pointed hat and flowing white beard', category: 'avatar', theme: 'wizard' },
	{ prompt: 'a young witch in a black wide-brimmed hat and dark layered robes, holding a broomstick', category: 'avatar', theme: 'witch' },
	{ prompt: 'a hooded sorcerer in midnight blue robes with glowing arcane runes embroidered on the sleeves', category: 'avatar', theme: 'sorcerer' },
	{ prompt: 'a fire mage with flame-orange robes and ember tattoos on their arms, hands glowing with fire', category: 'avatar', theme: 'fire-mage' },
	{ prompt: 'an ice wizard in pale blue crystalline robes with frost patterns, white hair and icicle staff', category: 'avatar', theme: 'ice-mage' },
	{ prompt: 'a nature druid wearing bark armor and a leafy antler crown, moss green cloak', category: 'avatar', theme: 'druid' },
	{ prompt: 'a necromancer in torn black robes with bone accessories and hollow glowing purple eyes', category: 'avatar', theme: 'necromancer' },
	{ prompt: 'a battle mage in reinforced azure robes over chainmail with geometric arcane symbols on pauldrons', category: 'avatar', theme: 'battle-mage' },

	// Fantasy archers & rogues
	{ prompt: 'a wood elf ranger in green leather armor with a quiver of arrows and recurve bow', category: 'avatar', theme: 'ranger' },
	{ prompt: 'a halfling rogue in a brown leather vest with many pockets and daggers at the belt', category: 'avatar', theme: 'rogue' },
	{ prompt: 'a shadow assassin in form-fitting black leather armor with a face mask and twin blades', category: 'avatar', theme: 'assassin' },
	{ prompt: 'a swashbuckler pirate captain in a tricorn hat, long coat and rapier at their side', category: 'avatar', theme: 'pirate' },
	{ prompt: 'a drow dark elf huntress in obsidian leather armor with white hair and a crossbow', category: 'avatar', theme: 'drow' },

	// Fantasy creatures & non-humans
	{ prompt: 'an orc berserker with green tusked skin, spiked iron shoulder guards and a massive club', category: 'avatar', theme: 'orc' },
	{ prompt: 'a lizardfolk shaman with green-blue scales, tribal bone necklaces and a feathered staff', category: 'avatar', theme: 'lizardfolk' },
	{ prompt: 'a gnome tinker in brass goggles, a tool-covered leather apron and wild spiky hair', category: 'avatar', theme: 'gnome' },
	{ prompt: 'a high elf noble in silver ceremonial armor with elegant ear tips and golden crown', category: 'avatar', theme: 'elf-noble' },
	{ prompt: 'a dwarf blacksmith with a thick braided red beard, leather apron and hammer in hand', category: 'avatar', theme: 'dwarf' },
	{ prompt: 'a tiefling warlock with curved horns, deep purple skin and glowing golden eyes in dark robes', category: 'avatar', theme: 'tiefling' },
	{ prompt: 'a minotaur warrior with bull horns, muscular dark-furred body, wearing a studded loincloth', category: 'avatar', theme: 'minotaur' },
	{ prompt: 'a beastkin wolf warrior with grey fur, amber eyes and tattered clan armor', category: 'avatar', theme: 'wolfkin' },
	{ prompt: 'a golem guardian made of mossy stone with glowing blue rune eyes and cracked boulder fists', category: 'avatar', theme: 'golem' },

	// Sci-fi & futuristic
	{ prompt: 'a space marine in heavy powered exosuit armor with a reflective gold visor and shoulder cannons', category: 'avatar', theme: 'space-marine' },
	{ prompt: 'a sleek humanoid robot with a polished chrome body, glowing blue chest core and articulated hands', category: 'avatar', theme: 'android' },
	{ prompt: 'a cyberpunk street fighter with neon blue tattoos, a bionic left arm and mirrored shades', category: 'avatar', theme: 'cyberpunk' },
	{ prompt: 'an alien diplomat with elongated silver head, large dark eyes, translucent robes and three fingers', category: 'avatar', theme: 'alien' },
	{ prompt: 'a futuristic bounty hunter in a weathered helmet and matte black armor with holsters', category: 'avatar', theme: 'bounty-hunter' },
	{ prompt: 'a mech pilot in a form-fitting orange flight suit with a cracked visor and neural jack ports', category: 'avatar', theme: 'mech-pilot' },
	{ prompt: 'a neon-lit android with a transparent skull revealing circuitry, feminine chrome frame', category: 'avatar', theme: 'neon-android' },
	{ prompt: 'a bio-augmented soldier with one mechanical eye, plated arms and a combat vest covered in patches', category: 'avatar', theme: 'augmented' },
	{ prompt: 'a quantum hacker in a sleek black bodysuit with holographic projectors on the wrists', category: 'avatar', theme: 'hacker' },
	{ prompt: 'a star captain in a weathered deep-space suit with rank insignia and a plasma pistol at the hip', category: 'avatar', theme: 'star-captain' },

	// Mythological & elemental
	{ prompt: 'a kitsune spirit with white fox ears and a nine-tailed form, wearing traditional miko robes', category: 'avatar', theme: 'kitsune' },
	{ prompt: 'an oni demon with red skin, two horns, tiger-skin loincloth and an iron kanabo club', category: 'avatar', theme: 'oni' },
	{ prompt: 'a sea god with deep blue skin, coral crown, flowing water robes and a trident', category: 'avatar', theme: 'sea-god' },
	{ prompt: 'a storm elemental with a swirling cloud-like body and lightning arcs for eyes', category: 'avatar', theme: 'storm-elemental' },
	{ prompt: 'a lava golem with cracked obsidian skin, glowing orange cracks and ember eyes', category: 'avatar', theme: 'lava-golem' },
	{ prompt: 'a forest spirit with bark-like skin, leaf-green hair and glowing sap veins running down the arms', category: 'avatar', theme: 'forest-spirit' },
	{ prompt: 'an egyptian pharaoh god in golden headpiece and lapis-lazuli collar, crook and flail in hand', category: 'avatar', theme: 'pharaoh' },
	{ prompt: 'a norse god with a long golden beard, fur mantle, an eye patch and a hammer at their side', category: 'avatar', theme: 'thor-archetype' },

	// Modern & urban
	{ prompt: 'a streetwear skateboarder with a hooded jacket, sneakers and a skateboard tucked under the arm', category: 'avatar', theme: 'skater' },
	{ prompt: 'a post-apocalyptic scavenger in a patchwork leather coat, gas mask around the neck, studded knee pads', category: 'avatar', theme: 'scavenger' },
	{ prompt: 'a professional boxer in silk shorts with gloves raised in a fighting stance', category: 'avatar', theme: 'boxer' },
	{ prompt: 'a parkour runner in a slim athletic jacket and cargo pants, poised mid-leap', category: 'avatar', theme: 'parkour' },
	{ prompt: 'a graffiti artist in baggy overalls with paint-stained gloves and a spray can in hand', category: 'avatar', theme: 'graffiti' },

	// ── ACCESSORIES ──────────────────────────────────────────────────────────

	// Swords & blades
	{ prompt: 'an ornate medieval broadsword with a gold cross guard, leather-wrapped grip and ruby gems on the pommel, game asset', category: 'accessory', theme: 'knight' },
	{ prompt: 'a curved scimitar with an engraved blade and a crescent-moon shaped hilt inlaid with turquoise', category: 'accessory', theme: 'ranger' },
	{ prompt: 'a pair of matched twin katana with black lacquer scabbards, silk-wrapped handles and gold fittings', category: 'accessory', theme: 'ninja' },
	{ prompt: 'a dark knight longsword with a jagged obsidian blade and a skull-shaped cross guard', category: 'accessory', theme: 'dark-knight' },
	{ prompt: 'a silver elven blade with a leaf-shaped edge and a vine-carved hilt set with an emerald', category: 'accessory', theme: 'elf-noble' },
	{ prompt: 'a paladin greatsword glowing with golden holy light, intricate cross motifs on the blade', category: 'accessory', theme: 'paladin' },
	{ prompt: 'a rogue dagger with a wavy blade, slim profile, bone handle and a poison groove along the spine', category: 'accessory', theme: 'rogue' },
	{ prompt: 'a pirate cutlass with a swept basket hilt, slightly curved blade and a worn leather grip', category: 'accessory', theme: 'pirate' },

	// Axes, hammers & blunt weapons
	{ prompt: 'a double-headed battle axe with a runic carved blade and oak handle wrapped in iron bands', category: 'accessory', theme: 'viking' },
	{ prompt: 'a massive iron war hammer with a flat striking face etched with dwarf clan runes, short thick handle', category: 'accessory', theme: 'dwarf' },
	{ prompt: 'a flanged war mace with a steel spiked head and a velvet-wrapped pommel grip', category: 'accessory', theme: 'crusader' },
	{ prompt: 'a gladiator trident with three pronged tips and a shaft wrapped in leather cord', category: 'accessory', theme: 'gladiator' },
	{ prompt: 'a minotaur great club made from a gnarled iron-bound oak log, brutal and heavy', category: 'accessory', theme: 'minotaur' },

	// Staves & wands
	{ prompt: 'a wizard staff made from twisted oak topped with a large glowing purple crystal orb', category: 'accessory', theme: 'wizard' },
	{ prompt: 'a fire mage staff with a burning ember crystal at the tip, the shaft scorched black', category: 'accessory', theme: 'fire-mage' },
	{ prompt: 'an ice scepter with a frost-white crystal globe and silver filigree shaft with snowflake patterns', category: 'accessory', theme: 'ice-mage' },
	{ prompt: 'a druid gnarled wooden staff with antler branch at the top threaded with green crystals and leaves', category: 'accessory', theme: 'druid' },
	{ prompt: 'a necromancer bone staff topped with a cracked human skull and wrapped in tattered dark cloth', category: 'accessory', theme: 'necromancer' },
	{ prompt: 'a glowing arcane wand made of pale birch with an amethyst tip and gold wire wrapping', category: 'accessory', theme: 'sorcerer' },
	{ prompt: 'a kitsune ceremonial naginata with a curved blade, lacquered shaft and red tassel', category: 'accessory', theme: 'kitsune' },

	// Shields & armor pieces
	{ prompt: 'a knight tower shield painted with a red dragon crest, bordered with polished steel trim', category: 'accessory', theme: 'knight' },
	{ prompt: 'a round norse shield with iron boss center, painted in black and gold with runic trim', category: 'accessory', theme: 'viking' },
	{ prompt: 'a roman scutum rectangular shield in red with golden eagle emblem, curved to the body', category: 'accessory', theme: 'roman' },
	{ prompt: 'an ornate pauldron shoulder guard in gold with lion head motif and articulated scales', category: 'accessory', theme: 'paladin' },
	{ prompt: 'a cyberpunk arm bracer with glowing data ports, carbon fibre panels and LED strip lighting', category: 'accessory', theme: 'cyberpunk' },

	// Helmets & headgear
	{ prompt: 'a great helm with a narrow eye slit and ventail, dented from battle, classic knight style', category: 'accessory', theme: 'knight' },
	{ prompt: 'a horned viking helmet in iron with a nose guard and etched battle scenes', category: 'accessory', theme: 'viking' },
	{ prompt: 'a roman legionary galea helmet with a transverse red horsehair crest', category: 'accessory', theme: 'roman' },
	{ prompt: 'a samurai kabuto helmet in black lacquer with golden antler decorations and a fierce face guard', category: 'accessory', theme: 'samurai' },
	{ prompt: 'a futuristic space marine helmet with a reflective gold visor and built-in antenna', category: 'accessory', theme: 'space-marine' },
	{ prompt: 'a wizard pointed hat in midnight blue with silver star patterns and a drooping tip', category: 'accessory', theme: 'wizard' },

	// Ranged weapons
	{ prompt: 'a longbow made of yew with a recurve tip, detailed wood grain and a leather grip wrap', category: 'accessory', theme: 'ranger' },
	{ prompt: 'a quiver of arrows with fletched goose-feather shafts in a tooled leather quiver', category: 'accessory', theme: 'ranger' },
	{ prompt: 'a compact crossbow with a steel prod, walnut stock and trigger mechanism', category: 'accessory', theme: 'drow' },
	{ prompt: 'a futuristic plasma pistol with a glowing blue barrel and ergonomic grip, compact and sleek', category: 'accessory', theme: 'star-captain' },
	{ prompt: 'a heavy sci-fi railgun with targeting scope, heat vents and energy cell slots along the barrel', category: 'accessory', theme: 'space-marine' },

	// Bags, books & tools
	{ prompt: 'a leather adventurer backpack with multiple buckled pouches, a bedroll tied below and rope clipped to the side', category: 'accessory', theme: 'ranger' },
	{ prompt: 'a spellbook with a worn leather cover, brass corner clasps and glowing arcane runes on the pages', category: 'accessory', theme: 'wizard' },
	{ prompt: 'a gnome tinker toolbox made of brass and wood, covered in small compartments, cogs and dials', category: 'accessory', theme: 'gnome' },
	{ prompt: 'a pirate treasure chest in dark wood with iron banding and a heavy padlock', category: 'accessory', theme: 'pirate' },

	// Amulets, orbs & magical items
	{ prompt: 'a crystal ball on a silver tripod stand, swirling mist visible inside the glass sphere', category: 'accessory', theme: 'sorcerer' },
	{ prompt: 'a golden amulet with a sapphire stone center and intricate knotwork border on a thick chain', category: 'accessory', theme: 'paladin' },
	{ prompt: 'a necromancer phylactery, a small black iron box with a green glowing soul gem, chained shut', category: 'accessory', theme: 'necromancer' },
	{ prompt: 'a fire elemental gem trapped in an ornate silver cage pendant, flickering flames visible inside', category: 'accessory', theme: 'fire-mage' },
	{ prompt: 'a quantum hacker datapad with holographic display showing cascading code, slim alloy body', category: 'accessory', theme: 'hacker' },
	{ prompt: 'a cyberpunk neural interface headset with wire leads, titanium frame and a blinking status LED', category: 'accessory', theme: 'cyberpunk' },

	// Boots, cloaks & wearable items
	{ prompt: 'a pair of heavy iron-toed knight sabatons with articulated plates down the top', category: 'accessory', theme: 'knight' },
	{ prompt: 'a ranger green hooded cloak, weathered and hemmed with small leaves carved into the border', category: 'accessory', theme: 'ranger' },
	{ prompt: 'a pair of knee-high pirate leather boots with wide turned-down cuffs and silver buckles', category: 'accessory', theme: 'pirate' },
	{ prompt: 'an elven circlet crown of woven silver with a single moonstone gem at the center', category: 'accessory', theme: 'elf-noble' },
	{ prompt: 'a ninja tabi boot in black, split-toe design with a gripping sole and ankle lace detail', category: 'accessory', theme: 'ninja' },
	{ prompt: 'a scavenger gas mask with cracked lenses, rubber seal and a corrugated filter hose', category: 'accessory', theme: 'scavenger' },
];

// OG username pool — short common English words that look like someone grabbed
// them on day one. The cron tries the bare word first; if taken it appends an
// incrementing number (wolf2, wolf3 …) to stay unique without looking synthetic.
export const OG_USERNAMES = [
	// nature & landscape
	'wolf', 'raven', 'storm', 'frost', 'ember', 'ash', 'coal', 'oak', 'pine',
	'river', 'dawn', 'dusk', 'tide', 'moon', 'star', 'mist', 'fog', 'rain',
	'snow', 'ice', 'fire', 'wind', 'rock', 'stone', 'leaf', 'moss', 'reed',
	'fern', 'thorn', 'briar', 'gale', 'vale', 'glen', 'moor', 'fen', 'dale',
	'crag', 'ford', 'holt', 'shaw', 'mere', 'fell', 'tor', 'holm', 'ridge',
	'cliff', 'coast', 'cove', 'cape', 'bluff', 'gorge', 'plain', 'peak', 'pass',
	'dune', 'delta', 'shoal', 'reef', 'knoll', 'heath', 'marsh', 'grove',
	// animals
	'fox', 'bear', 'hawk', 'elk', 'owl', 'crane', 'deer', 'lynx', 'boar',
	'crow', 'viper', 'ram', 'bull', 'drake', 'kite', 'wren', 'heron', 'pike',
	'bison', 'moose', 'puma', 'ibex', 'colt', 'finch', 'trout', 'swift',
	// materials & qualities
	'iron', 'gold', 'silver', 'bronze', 'steel', 'flint', 'slate', 'amber',
	'jade', 'onyx', 'opal', 'pearl', 'ivory', 'chalk', 'clay', 'sable',
	'bold', 'dark', 'bright', 'deep', 'still', 'sharp', 'keen', 'wild', 'true',
	'pure', 'lone', 'free', 'vast', 'grim', 'grit', 'calm',
	// verbs used as handles
	'forge', 'craft', 'carve', 'cast', 'weld', 'spark', 'flame', 'glow',
	'drift', 'burn', 'rise', 'hunt', 'seek', 'hold', 'draw', 'mark', 'cut',
	'form', 'mend', 'bind', 'wave', 'flow', 'run',
	// sky & cosmos
	'comet', 'nova', 'void', 'flare', 'pulse', 'orbit', 'zenith', 'apex',
	'beam', 'arc', 'flux', 'ray', 'haze', 'veil', 'shade', 'glare',
	// misc evocative words
	'copse', 'brake', 'weald', 'wold', 'rill', 'beck', 'burn', 'loch',
	'tarn', 'down', 'heath', 'wold', 'sward', 'brae', 'burn',
];
