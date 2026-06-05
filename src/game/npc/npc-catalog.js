// Data-driven catalog of interactive NPCs.
//
// One table, read by world-life.js, describes every vendor, quest-giver, and
// flavor townsperson in a world: who they are, where they stand, what they say,
// and what pressing E does. Adding an NPC is a table entry, never new wiring.
//
// Role actions reach the economy (W04) and quest (W05) systems through small
// `window` contracts so this brief can ship before those do: if the system is
// present the NPC drives it; if not, the NPC gives a designed, honest "opens with
// the next update" beat instead of a dead button or a faked shop. The contracts:
//
//   window.twsEconomy.openVendor(shop)   → open a buy/sell shop (W04)
//   window.twsQuests.offerMission(mission) → present a job/mission (W05)
//
// The flagship $THREE town gets the full cast first (W00: land flagship features
// in the home town). Every other coin world gets a couple of flavor locals so it
// never feels abandoned.

import { isHomeTown } from '../home-town.js';

const AVATAR_A = '/avatars/default.glb';
const AVATAR_B = '/avatars/cz.glb';

// Reach the W04 vendor system, or fall back to an honest "coming soon" beat that
// still tells the player exactly what this stall will do.
function openVendorOrInform({ npc, ui }) {
	const shop = npc.def.shop;
	const econ = typeof window !== 'undefined' ? window.twsEconomy : null;
	if (econ && typeof econ.openVendor === 'function') {
		npc.say(shop.greeting);
		npc.emote('av-call-me');
		econ.openVendor(shop);
		return;
	}
	npc.say(shop.soon);
	ui?.toast?.(`${shop.title} — opens with the in-world economy.`, 'info');
}

// Reach the W05 mission system, or fall back to an honest "no work yet" beat.
function offerMissionOrInform({ npc, ui }) {
	const mission = npc.def.mission;
	const quests = typeof window !== 'undefined' ? window.twsQuests : null;
	if (quests && typeof quests.offerMission === 'function') {
		npc.say(mission.greeting);
		npc.emote('av-arm-flex');
		quests.offerMission(mission);
		return;
	}
	npc.say(mission.soon);
	ui?.toast?.(`${mission.title} — jobs open with the missions update.`, 'info');
}

// Build the interactive-NPC list for a world. `world` carries { mint, biome }.
export function npcCatalogFor(world) {
	const list = [];
	const home = isHomeTown(world?.mint);

	if (home) {
		// The market trader — the front of the economy. Stands plaza-west with a
		// stall the manager paints behind him.
		list.push({
			id: 'vendor-market',
			name: 'Marisol · Trader',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: -11, z: -3 },
			yaw: Math.PI / 2,
			range: 5,
			prompt: 'Browse the market',
			onInteract: openVendorOrInform,
			shop: {
				id: 'general',
				title: 'Dust Gulch Market',
				greeting: 'Welcome, partner. Everything’s priced fair.',
				soon: 'Stall’s nearly stocked — the market opens with the next update.',
				// Catalog described honestly so the empty state still teaches what's coming.
				goods: [
					{ name: 'Fishing Rod', kind: 'tool' },
					{ name: 'Pickaxe', kind: 'tool' },
					{ name: 'Lantern', kind: 'gear' },
				],
			},
		});

		// The sheriff — quest-giver. Posts work on the board by the jail.
		list.push({
			id: 'quest-sheriff',
			name: 'Sheriff Boone',
			role: 'quest',
			avatar: AVATAR_A,
			pos: { x: -13, z: 9 },
			yaw: 0,
			range: 5,
			prompt: 'See available work',
			onInteract: offerMissionOrInform,
			mission: {
				id: 'first-bounty',
				title: 'Sheriff’s Board',
				greeting: 'Town could use a hand. Pick up a job off the board.',
				soon: 'No bounties posted yet — work opens with the missions update.',
			},
		});

		// Flavor locals — pure life, cycle through chatter.
		list.push({
			id: 'flavor-prospector',
			name: 'Old Pete',
			role: 'flavor',
			avatar: AVATAR_B,
			pos: { x: 15, z: 11 },
			yaw: -Math.PI * 0.7,
			prompt: 'Talk',
			dialogue: [
				'Struck color up the mesa once. Spent it all by sundown.',
				'You watch them two robots by the plaza? Tradin’ real coin.',
				'Storm’s comin’. Always is, out here.',
			],
		});
		list.push({
			id: 'flavor-piano',
			name: 'Saloon Kid',
			role: 'flavor',
			avatar: AVATAR_A,
			pos: { x: -6, z: 17 },
			yaw: -Math.PI / 2,
			prompt: 'Talk',
			dialogue: [
				'Drinks are on the house — once we get a bartender.',
				'Heard the bank’s holdin’ real $THREE in the vault.',
				'You build somethin’ nice, I’ll play you a tune.',
			],
		});
		return list;
	}

	// Any other coin world: a couple of locals so the plaza has a pulse, placed
	// off the spawn line.
	list.push({
		id: 'flavor-local-1',
		name: 'Local',
		role: 'flavor',
		avatar: AVATAR_A,
		pos: { x: -12, z: 6 },
		yaw: Math.PI / 3,
		prompt: 'Talk',
		dialogue: [
			'New here? Walk around — you can build on this world.',
			'Whole place runs on $THREE. Few understand.',
			'More folks show up every day. We so back.',
		],
	});
	list.push({
		id: 'flavor-local-2',
		name: 'Local',
		role: 'flavor',
		avatar: AVATAR_B,
		pos: { x: 13, z: -8 },
		yaw: -Math.PI * 0.8,
		prompt: 'Talk',
		dialogue: [
			'gm. Vibes are immaculate today.',
			'Press B to build with everyone here.',
			'This is the way.',
		],
	});
	return list;
}
