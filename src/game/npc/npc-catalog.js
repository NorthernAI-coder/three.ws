// Data-driven catalog of interactive NPCs.
//
// One table, read by world-life.js, describes every townsperson in a world: who
// they are, where they stand, what they say, and what pressing E does. Adding an
// NPC is a table entry, never new wiring.
//
// Every service NPC fronts ONE real three.ws x402 endpoint. Walk up, press E,
// fill the counter form, pay the micro-fee from your wallet, and the service
// runs for real (see npc-services.js). This is the live economy: the town is a
// storefront where each character sells a different paid capability, settled
// on-chain in USDC, 24/7. No "coming soon", no mocks.
//
// The flagship $THREE town gets the full cast. Every other coin world gets a
// couple of universal-service locals so its plaza still trades.

import { isHomeTown } from '../home-town.js';
import { openChat } from './npc-chat.js';

const AVATAR_A = '/avatars/default.glb';
const AVATAR_B = '/avatars/cz.glb';

// Bind an NPC to a conversation. On interact the NPC greets in-world, plays a
// beat, and opens a real chat: it answers in character, live from the same models
// the chats use (see npc-chat.js). Vendors pass a serviceId so the chat surfaces
// the paid counter — the NPC talks you toward the sale, the counter settles it.
// `persona` is the character voice; `greeting` is the line spoken on walk-up.
function talk({ serviceId, persona, greeting, emote }) {
	return ({ npc, ui, world }) => {
		if (greeting) npc.say(greeting);
		if (emote) npc.emote(emote);
		openChat(npc, { ui, serviceId, persona, greeting, world });
	};
}

// Build the interactive-NPC list for a world. `world` carries { mint, biome }.
export function npcCatalogFor(world) {
	const list = [];
	const home = isHomeTown(world?.mint);

	if (home) {
		// Marisol — the trading desk. Sells live market signals (crypto-intel).
		list.push({
			id: 'svc-crypto-intel',
			name: 'Marisol · Trader',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: -11, z: -3 },
			yaw: Math.PI / 2,
			range: 5,
			prompt: 'Read the market',
			onInteract: talk({
				serviceId: 'crypto-intel',
				greeting: 'Want the read on a coin? A cent buys the truth.',
				emote: 'av-call-me',
				persona: 'You are Marisol, the town\'s trading desk — a sharp, fast-talking market reader who lives in numbers and never sugarcoats a chart. Confident, a little wry, always sizing up whether a thing is bullish or bearish.',
			}),
		});

		// Sheriff Boone — the law. Verifies claims (fact-check) with sources.
		list.push({
			id: 'svc-fact-check',
			name: 'Sheriff Boone',
			role: 'quest',
			avatar: AVATAR_A,
			pos: { x: -13, z: 9 },
			yaw: 0,
			range: 5,
			prompt: 'Bring a claim',
			onInteract: talk({
				serviceId: 'fact-check',
				greeting: 'Heard somethin’ you ain’t sure of? I’ll get to the truth.',
				emote: 'av-arm-flex',
				persona: 'You are Sheriff Boone, the law in this town — slow, measured, and allergic to rumor. You weigh your words, distrust hearsay, and care only about what can be proven with sources. Plain-spoken frontier lawman.',
			}),
		});

		// Saloon Kid — the club. Tips a dancer onto the stage (dance-tip).
		list.push({
			id: 'svc-dance-tip',
			name: 'Saloon Kid',
			role: 'vendor',
			avatar: AVATAR_A,
			pos: { x: -6, z: 17 },
			yaw: -Math.PI / 2,
			range: 5,
			prompt: 'Tip the floor',
			onInteract: talk({
				serviceId: 'dance-tip',
				greeting: 'Drop a coin and somebody dances. Who’s it gonna be?',
				emote: 'av-call-me',
				persona: 'You are the Saloon Kid, the young hype-man running the dance floor at the club — all energy, grins, and showmanship. You live for a good time and love getting somebody up on stage.',
			}),
		});

		// Old Pete — the prospector. Grinds vanity Solana keys (vanity).
		list.push({
			id: 'svc-vanity',
			name: 'Old Pete',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: 15, z: 11 },
			yaw: -Math.PI * 0.7,
			range: 5,
			prompt: 'Grind an address',
			onInteract: talk({
				serviceId: 'vanity',
				greeting: 'I mine letters, not gold. Tell me what your address should spell.',
				emote: 'av-arm-flex',
				persona: 'You are Old Pete, a grizzled prospector who gave up panning for gold to mine vanity Solana addresses — letters, not nuggets. Crusty, patient, full of mining metaphors, proud of the keys you grind.',
			}),
		});

		// Wendell — the assay office clerk. Checks ticker collisions (symbol).
		list.push({
			id: 'svc-symbol',
			name: 'Wendell · Assayer',
			role: 'vendor',
			avatar: AVATAR_A,
			pos: { x: 12, z: -7 },
			yaw: -Math.PI * 0.85,
			range: 5,
			prompt: 'Stake a name',
			onInteract: talk({
				serviceId: 'symbol-availability',
				greeting: 'Before you stake that ticker — let me check it ain’t already claimed.',
				emote: 'av-call-me',
				persona: 'You are Wendell, the assay-office clerk — meticulous, precise, and a stickler for whether a ticker is already claimed. You treat a token symbol like a mining claim that has to be registered clean. Dry, exacting, a touch bureaucratic.',
			}),
		});

		// Mei — the foundry. Forges a token mint into a 3D mesh (mint-to-mesh).
		list.push({
			id: 'svc-mesh',
			name: 'Mei · Foundry',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: 8, z: 14 },
			yaw: Math.PI,
			range: 5,
			prompt: 'Forge a mesh',
			onInteract: talk({
				serviceId: 'mint-to-mesh',
				greeting: 'Hand me a mint. I’ll forge it into somethin’ you can hold.',
				emote: 'av-arm-flex',
				persona: 'You are Mei, the town foundry-keeper who forges token mints into 3D meshes you can actually hold. A maker with soot on her hands and real pride in her craft — warm, direct, always talking about what she can build.',
			}),
		});

		// Doc Halloran — the audit desk. Audits a pump-agent token (audit).
		list.push({
			id: 'svc-audit',
			name: 'Doc Halloran',
			role: 'vendor',
			avatar: AVATAR_A,
			pos: { x: 4, z: -12 },
			yaw: 0,
			range: 5,
			prompt: 'Audit the books',
			onInteract: talk({
				serviceId: 'pump-agent-audit',
				greeting: 'You don’t pay a token ’til you’ve seen its books. Give me a mint.',
				emote: 'av-call-me',
				persona: 'You are Doc Halloran, the town auditor — skeptical, careful, and never trusting a token until you\'ve read its ledger. You speak in ledgers and red flags, and you\'d rather find the rot before someone loses their stake. Wry, sharp-eyed.',
			}),
		});

		// The Oracle — reputation. Reads an agent's on-chain record (reputation).
		list.push({
			id: 'svc-reputation',
			name: 'The Oracle',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: -16, z: -8 },
			yaw: Math.PI / 4,
			range: 5,
			prompt: 'Vet an agent',
			onInteract: talk({
				serviceId: 'agent-reputation',
				greeting: 'Name the agent. I’ll tell you what the chain remembers.',
				emote: 'av-arm-flex',
				persona: 'You are the Oracle, a quiet seer who reads what the chain remembers about any agent — coins deployed, money taken, trust earned. You speak in measured, slightly mystical terms, but everything you say is grounded in the on-chain record.',
			}),
		});

		// The Schoolmarm — the tutor. Answers any question (tutor).
		list.push({
			id: 'svc-tutor',
			name: 'Miss Ada · Tutor',
			role: 'vendor',
			avatar: AVATAR_A,
			pos: { x: -3, z: -15 },
			yaw: 0,
			range: 5,
			prompt: 'Ask a question',
			onInteract: talk({
				serviceId: 'tutor',
				greeting: 'A cent a question, and you leave knowin’ more than you came. Ask.',
				emote: 'av-call-me',
				persona: 'You are Miss Ada, the town schoolmarm and tutor — patient, encouraging, and delighted by a good question. You explain things clearly with a teacher\'s warmth, code or crypto or the wider world, and you love when a visitor leaves a little smarter.',
			}),
		});

		// The Banker — the launchpad. Deploys a live pump.fun coin (pump-launch).
		list.push({
			id: 'svc-launch',
			name: 'Banker Cole',
			role: 'vendor',
			avatar: AVATAR_B,
			pos: { x: 16, z: 3 },
			yaw: -Math.PI / 2,
			range: 5,
			prompt: 'Launch a coin',
			onInteract: talk({
				serviceId: 'pump-launch',
				greeting: 'Five dollars and your coin’s on the board by sundown. Name it.',
				emote: 'av-arm-flex',
				persona: 'You are Banker Cole, the smooth-talking frontier banker who runs the launchpad — you front the SOL and put a live coin on the board. Polished, persuasive, a dealmaker who makes launching sound easy. Confident without being pushy.',
			}),
		});

		return list;
	}

	// Any other coin world: two universal-service locals so the plaza still
	// trades. These endpoints are coin-agnostic, so they work anywhere.
	list.push({
		id: 'svc-local-intel',
		name: 'Local · Trader',
		role: 'vendor',
		avatar: AVATAR_A,
		pos: { x: -12, z: 6 },
		yaw: Math.PI / 3,
		range: 5,
		prompt: 'Read the market',
		onInteract: talk({
			serviceId: 'crypto-intel',
			greeting: 'New here? A cent gets you the read on any coin.',
			emote: 'av-call-me',
			persona: 'You are the Local Trader, a friendly newcomer-greeter at this plaza\'s trading desk who reads the market for anyone passing through. Welcoming, quick with a number, happy to show a stranger the ropes.',
		}),
	});
	list.push({
		id: 'svc-local-factcheck',
		name: 'Local · Scribe',
		role: 'vendor',
		avatar: AVATAR_B,
		pos: { x: 13, z: -8 },
		yaw: -Math.PI * 0.8,
		range: 5,
		prompt: 'Bring a claim',
		onInteract: talk({
			serviceId: 'fact-check',
			greeting: 'Got a claim you want checked? I’ll run the sources.',
			emote: 'av-arm-flex',
			persona: 'You are the Local Scribe, the plaza\'s record-keeper who checks claims against the sources. Careful, literate, even-handed — you won\'t call a thing true or false until the sources back it.',
		}),
	});
	return list;
}
