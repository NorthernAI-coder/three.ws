// @ts-check
// Curated prompt pool for the forge auto-seed cron. Every prompt targets the
// FLUX text→image → TRELLIS image→3D pipeline. Realistic human subjects with
// strong silhouettes and clear costume detail produce the best meshes at draft
// quality — avoid thin objects, transparent materials, and busy backgrounds.
//
// Two categories: 'avatar' (realistic human characters) and 'accessory'
// (real-world wearables and carried items). The cron alternates so the gallery
// builds a coherent human character ecosystem.

/** @typedef {{ prompt: string, category: 'avatar' | 'accessory', theme: string }} SeedPrompt */

/** @type {SeedPrompt[]} */
export const SEED_PROMPTS = [
	// ── AVATARS — realistic humans ────────────────────────────────────────────

	// Streetwear & urban
	{ prompt: 'a young black man in an oversized white hoodie and baggy jeans, fresh white sneakers, relaxed confident stance, studio lighting', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a hispanic woman in a cropped leather jacket, high-waisted jeans and chunky boots, bold gold hoop earrings, neutral background', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a south asian man in a fitted tracksuit and retro running shoes, gold chain, arms crossed, clean studio background', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a white woman in an oversized graphic tee, biker shorts and platform sneakers, wearing a beanie, street style portrait', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a black woman with natural hair in a brown shearling coat and cargo pants, sculptural jewelry, fashion portrait', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'an east asian man in a monochrome grey tech fleece, slim joggers and clean white sneakers, hands in pockets', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a latina woman in a bright red puffer jacket, low-rise jeans and strappy heels, bold lip, confident pose', category: 'avatar', theme: 'streetwear' },
	{ prompt: 'a middle eastern man in an olive bomber jacket, straight-leg cargos and leather boots, cropped beard, studio portrait', category: 'avatar', theme: 'streetwear' },

	// Athleisure & sports
	{ prompt: 'a muscular black man in a fitted sleeveless gym top and athletic shorts, sports watch, gym portrait lighting', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a fit asian woman in a sports bra and high-waisted leggings, hair in a high ponytail, clean studio background', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a white male runner in a technical running jacket and slim track pants, earbuds, athletic build, daylight portrait', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a black female basketball player in a jersey and shorts, knee sleeve, arms at sides, confident studio pose', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a hispanic male boxer in a satin robe over shorts, hands wrapped, short cropped hair, serious expression', category: 'avatar', theme: 'athletic' },
	{ prompt: 'an asian female martial artist in a white gi with a black belt, hair back, grounded neutral stance', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a south asian male soccer player in a club jersey and shorts, cleats, standing confidently', category: 'avatar', theme: 'athletic' },
	{ prompt: 'a fit white woman in a yoga set, sports bra and seamless leggings, minimal jewelry, soft studio light', category: 'avatar', theme: 'athletic' },

	// Business & professional
	{ prompt: 'a black man in a perfectly fitted charcoal suit, white dress shirt, no tie, polished oxford shoes, executive portrait', category: 'avatar', theme: 'professional' },
	{ prompt: 'an asian woman in a structured blazer and tailored trousers, silk blouse, minimal gold jewelry, office portrait', category: 'avatar', theme: 'professional' },
	{ prompt: 'a white man in a navy business suit and pocket square, silver watch, clean shaven, confident posture', category: 'avatar', theme: 'professional' },
	{ prompt: 'a latina woman in a cream power suit with wide lapels, statement earrings, natural makeup, professional portrait', category: 'avatar', theme: 'professional' },
	{ prompt: 'a south asian man in a slim-fit grey suit and burgundy tie, briefcase in hand, sharp business portrait', category: 'avatar', theme: 'professional' },
	{ prompt: 'a middle eastern woman in a white lab coat over business clothes, stethoscope around neck, professional medical portrait', category: 'avatar', theme: 'professional' },

	// Fashion & editorial
	{ prompt: 'a tall black woman in a sleek black turtleneck and wide-leg trousers, sculptural minimalist look, editorial fashion portrait', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a white man in a vintage denim jacket covered in pins, ripped jeans and chelsea boots, indie fashion portrait', category: 'avatar', theme: 'fashion' },
	{ prompt: 'an east asian woman in a pastel micro-pleated skirt and matching top, platform mary janes, harajuku-inspired look', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a black man in an embroidered silk shirt and white linen trousers, loafers, summer fashion portrait', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a mixed-race woman in a bold geometric print co-ord set, square-toe mules, editorial stance', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a white woman in a long camel trench coat, fitted turtleneck and ankle boots, minimalist chic portrait', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a south asian man in a richly embroidered sherwani, dress shoes, wedding fashion portrait', category: 'avatar', theme: 'fashion' },
	{ prompt: 'a black woman in a red bodycon dress and strappy heels, bold makeup, glamour portrait lighting', category: 'avatar', theme: 'fashion' },

	// Casual & everyday
	{ prompt: 'a young white man in a washed blue denim jacket, plain white tee, slim jeans and canvas shoes, casual portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a black woman in a floral sundress and flat sandals, natural hair down, summer casual portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'an asian man in a quarter-zip pullover, slim chinos and loafers, casual smart portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a hispanic woman in a cozy oversized knit sweater, straight jeans and ankle boots, autumn casual portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a middle eastern man in a crisp linen shirt and tailored shorts, leather sandals, relaxed summer portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a white woman in a classic striped breton top, straight jeans and white sneakers, clean minimalist portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a black man in a rust-colored corduroy jacket, khaki trousers and white shirt, warm casual portrait', category: 'avatar', theme: 'casual' },
	{ prompt: 'a south asian woman in a salwar kameez with a dupatta, traditional everyday casual portrait', category: 'avatar', theme: 'casual' },

	// Subculture & creative
	{ prompt: 'a white man with sleeve tattoos in a black band tee, straight-leg black jeans and combat boots, rock portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'a black woman in a pastel goth outfit, lavender hair, layered skirt and platform shoes, alt fashion portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'an east asian man with bleached hair in a y2k outfit, baggy low-rise jeans and a slim mesh top, fashion portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'a latina woman in a vintage 90s windbreaker, bike shorts and chunky sneakers, retro streetwear portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'a white skateboarder in a loose polo shirt, wide-leg cords and skate shoes, cap turned backwards, portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'a black man in a dashiki and linen trousers, wooden bead necklace, natural hair, cultural portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'an asian woman in a full harajuku coord with layered accessories, knee socks and platforms, portrait', category: 'avatar', theme: 'subculture' },
	{ prompt: 'a south asian woman in a modern fusion sari-draped outfit, street fashion editorial portrait', category: 'avatar', theme: 'subculture' },

	// ── ACCESSORIES — real-world wearables & carried items ───────────────────

	// Footwear
	{ prompt: 'a pair of classic white low-top leather sneakers with clean soles and minimal branding, product shot', category: 'accessory', theme: 'sneakers' },
	{ prompt: 'a pair of retro chunky-sole basketball sneakers in black and gold, bold silhouette, product shot', category: 'accessory', theme: 'sneakers' },
	{ prompt: 'a pair of worn brown leather chelsea boots with elastic side panels and a stacked heel', category: 'accessory', theme: 'boots' },
	{ prompt: 'a pair of strappy black leather heeled sandals with an ankle buckle, elegant product shot', category: 'accessory', theme: 'heels' },
	{ prompt: 'a pair of high-top canvas sneakers in off-white with black rubber toe cap', category: 'accessory', theme: 'sneakers' },
	{ prompt: 'a pair of sleek black leather oxford dress shoes with a cap-toe detail and leather sole', category: 'accessory', theme: 'dress-shoes' },
	{ prompt: 'a pair of white athletic running shoes with a mesh upper and foam midsole, sport product shot', category: 'accessory', theme: 'sneakers' },
	{ prompt: 'a pair of tan suede lace-up desert boots with a crepe sole', category: 'accessory', theme: 'boots' },

	// Bags & carriers
	{ prompt: 'a structured black leather tote bag with gold hardware, top handles and a detachable strap', category: 'accessory', theme: 'bag' },
	{ prompt: 'a slim brown leather messenger bag with a buckle flap, adjustable strap and multiple pockets', category: 'accessory', theme: 'bag' },
	{ prompt: 'a canvas and leather trim backpack in tan with a laptop sleeve and brass buckles', category: 'accessory', theme: 'bag' },
	{ prompt: 'a small quilted black leather crossbody bag with a gold chain strap, luxury style product shot', category: 'accessory', theme: 'bag' },
	{ prompt: 'a sporty nylon drawstring gym bag in black with a side bottle pocket', category: 'accessory', theme: 'bag' },
	{ prompt: 'a woven straw summer tote with leather handles and a striped lining, beach bag', category: 'accessory', theme: 'bag' },

	// Outerwear
	{ prompt: 'a classic tan trench coat laid flat, double-breasted with belt and epaulettes, clean product shot', category: 'accessory', theme: 'jacket' },
	{ prompt: 'a worn brown leather biker jacket with silver zips and a pointed lapel collar', category: 'accessory', theme: 'jacket' },
	{ prompt: 'a quilted black puffer jacket with a high collar and elastic cuffs, puffer product shot', category: 'accessory', theme: 'jacket' },
	{ prompt: 'a relaxed oversized grey wool overcoat with wide lapels and deep pockets', category: 'accessory', theme: 'jacket' },
	{ prompt: 'a varsity jacket in navy and white with leather sleeves and ribbed trim', category: 'accessory', theme: 'jacket' },
	{ prompt: 'a lightweight olive field jacket with multiple flap pockets and a hood', category: 'accessory', theme: 'jacket' },

	// Headwear
	{ prompt: 'a structured fitted black baseball cap with a curved brim and embroidered logo on front', category: 'accessory', theme: 'hat' },
	{ prompt: 'a cream ribbed beanie with a fold-up cuff, soft knit texture, product shot', category: 'accessory', theme: 'hat' },
	{ prompt: 'a wide-brim sun hat in natural straw with a black grosgrain band', category: 'accessory', theme: 'hat' },
	{ prompt: 'a black wool beret, classic french style, worn at an angle, product shot', category: 'accessory', theme: 'hat' },
	{ prompt: 'a snapback trucker hat in mesh with a flat brim and front foam patch', category: 'accessory', theme: 'hat' },

	// Jewelry & watches
	{ prompt: 'a chunky gold rope chain necklace with a box clasp, heavy links, luxury product shot', category: 'accessory', theme: 'jewelry' },
	{ prompt: 'a silver stainless steel watch with a round dial, date window and mesh bracelet', category: 'accessory', theme: 'watch' },
	{ prompt: 'a pair of large gold hoop earrings with a polished finish, classic style', category: 'accessory', theme: 'jewelry' },
	{ prompt: 'a wide gold cuff bracelet with a hammered texture and polished edges', category: 'accessory', theme: 'jewelry' },
	{ prompt: 'a black rubber sport watch with a chunky case, tachymeter bezel and digital display', category: 'accessory', theme: 'watch' },
	{ prompt: 'a stack of thin gold rings in varying widths, laid flat, minimalist jewelry product shot', category: 'accessory', theme: 'jewelry' },
	{ prompt: 'a pearl strand necklace with a gold clasp, classic length, clean product shot', category: 'accessory', theme: 'jewelry' },
	{ prompt: 'a silver tennis bracelet with clear stones set in a row, elegant product shot', category: 'accessory', theme: 'jewelry' },

	// Eyewear
	{ prompt: 'a pair of classic tortoiseshell wayfarer sunglasses with dark lenses, product shot', category: 'accessory', theme: 'eyewear' },
	{ prompt: 'a pair of slim gold wire-frame round glasses with clear lenses', category: 'accessory', theme: 'eyewear' },
	{ prompt: 'a pair of oversized square black sunglasses with gradient lenses, fashion eyewear product shot', category: 'accessory', theme: 'eyewear' },
	{ prompt: 'a pair of sporty wraparound sunglasses in black with mirrored lenses', category: 'accessory', theme: 'eyewear' },

	// Everyday carry
	{ prompt: 'a slim bifold wallet in black pebbled leather with card slots visible, product shot', category: 'accessory', theme: 'carry' },
	{ prompt: 'a matte black phone case with a card slot on the back, minimal design', category: 'accessory', theme: 'carry' },
	{ prompt: 'a stainless steel insulated water bottle in matte black with a loop cap', category: 'accessory', theme: 'carry' },
	{ prompt: 'a pair of white wireless over-ear headphones with padded cushions and a folding frame', category: 'accessory', theme: 'carry' },
	{ prompt: 'a clean white airpods case with glossy finish, small product shot', category: 'accessory', theme: 'carry' },
	{ prompt: 'a vintage-style zippo lighter in brushed silver with a flip lid, product shot', category: 'accessory', theme: 'carry' },

	// Scarves, belts & other
	{ prompt: 'a cashmere scarf in camel plaid, loosely folded to show the fringe ends, product shot', category: 'accessory', theme: 'scarf' },
	{ prompt: 'a wide leather belt in cognac brown with a silver square buckle', category: 'accessory', theme: 'belt' },
	{ prompt: 'a silk pocket square in a deep burgundy paisley pattern, folded in a TV fold', category: 'accessory', theme: 'accessory' },
	{ prompt: 'a pair of black leather gloves with a cashmere lining, classic style, product shot', category: 'accessory', theme: 'gloves' },
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
	// misc
	'ridge', 'rill', 'beck', 'loch', 'tarn', 'down', 'sward', 'brae',
	'copse', 'weald', 'wold', 'brake',
];
