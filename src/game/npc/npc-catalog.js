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
import { openService } from './npc-services.js';

const AVATAR_A = '/avatars/default.glb';
const AVATAR_B = '/avatars/cz.glb';

// Bind an NPC to its x402 service. On interact the NPC greets, plays a beat, and
// opens its service counter; the counter runs the real wallet payment.
function serve(serviceId, greeting, emote) {
	return ({ npc, ui }) => {
		if (greeting) npc.say(greeting);
		if (emote) npc.emote(emote);
		openService(serviceId, { npc, ui });
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
			onInteract: serve('crypto-intel', 'Want the read on a coin? A cent buys the truth.', 'av-call-me'),
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
			onInteract: serve('fact-check', 'Heard somethin’ you ain’t sure of? I’ll get to the truth.', 'av-arm-flex'),
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
			onInteract: serve('dance-tip', 'Drop a coin and somebody dances. Who’s it gonna be?', 'av-call-me'),
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
			onInteract: serve('vanity', 'I mine letters, not gold. Tell me what your address should spell.', 'av-arm-flex'),
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
			onInteract: serve('symbol-availability', 'Before you stake that ticker — let me check it ain’t already claimed.', 'av-call-me'),
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
			onInteract: serve('mint-to-mesh', 'Hand me a mint. I’ll forge it into somethin’ you can hold.', 'av-arm-flex'),
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
			onInteract: serve('pump-agent-audit', 'You don’t pay a token ’til you’ve seen its books. Give me a mint.', 'av-call-me'),
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
			onInteract: serve('agent-reputation', 'Name the agent. I’ll tell you what the chain remembers.', 'av-arm-flex'),
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
			onInteract: serve('tutor', 'A cent a question, and you leave knowin’ more than you came. Ask.', 'av-call-me'),
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
			onInteract: serve('pump-launch', 'Five dollars and your coin’s on the board by sundown. Name it.', 'av-arm-flex'),
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
		onInteract: serve('crypto-intel', 'New here? A cent gets you the read on any coin.', 'av-call-me'),
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
		onInteract: serve('fact-check', 'Got a claim you want checked? I’ll run the sources.', 'av-arm-flex'),
	});
	return list;
}
