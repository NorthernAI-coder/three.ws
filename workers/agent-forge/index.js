// agent-forge — headless Live Avatar Forge caster.
//
// Runs a text→3D generation on the FREE NVIDIA NIM (Microsoft TRELLIS) lane and
// broadcasts it onto the agent's live screen: each real pipeline stage is pushed
// as a narration line, and the final frame carries the generated GLB url + a
// three.ws viewer link in its `meta` sidecar so every viewer on
// /agent-screen?agentId=… loads, rigs, and animates the freshly-forged avatar.
//
// This is the headless twin of the in-browser Forge button in src/agent-screen.js
// — both drive the same free lane and emit the same frames (shared pure logic in
// src/shared/forge-frames.js), so the watchable moment is identical whether a
// viewer triggers it or an operator runs this worker.
//
// Run:
//   AGENT_ID=<uuid> AGENT_JWT=<key> \
//   FORGE_PROMPT="a friendly round robot mascot, glossy white plastic" \
//   node index.js
//
// Or forge a list, one after another (newline- or |-separated):
//   FORGE_PROMPTS="a red origami crane|a tiny brass steampunk owl" node index.js
//
// Env:
//   AGENT_ID       (required) agent whose screen to cast onto
//   AGENT_JWT      (required) bearer token authorizing pushes as that agent
//   FORGE_PROMPT   single prompt (one-shot), OR
//   FORGE_PROMPTS  list of prompts split on newline or '|'
//   FORGE_TIER     draft | standard | high   (default draft — all free)
//   PUSH_URL       default https://three.ws/api/agent-screen-push
//   FORGE_BASE     three.ws origin for /api/forge + viewer links (default derived from PUSH_URL)

import {
	clampPrompt,
	validatePrompt,
	forgeStageNarration,
	finalForgeFrame,
} from '../../src/shared/forge-frames.js';
import { runForge } from './forge-run.js';

const AGENT_ID = process.env.AGENT_ID || '';
const AGENT_JWT = process.env.AGENT_JWT || '';
const PUSH_URL = process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push';
const TIER = ['draft', 'standard', 'high'].includes(process.env.FORGE_TIER) ? process.env.FORGE_TIER : 'draft';

// Derive the forge/viewer origin from PUSH_URL unless overridden.
const FORGE_BASE = (process.env.FORGE_BASE || PUSH_URL.replace(/\/api\/agent-screen-push\/?$/, '')).replace(/\/$/, '');

function parsePrompts() {
	if (process.env.FORGE_PROMPT) return [process.env.FORGE_PROMPT];
	if (process.env.FORGE_PROMPTS) {
		return process.env.FORGE_PROMPTS.split(/[\n|]+/).map((s) => s.trim()).filter(Boolean);
	}
	return [];
}

// Fire-and-forget frame push. Never throws — a failed push must not abort a forge.
async function pushFrame(frame) {
	try {
		const res = await fetch(PUSH_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_JWT}` },
			body: JSON.stringify({ agentId: AGENT_ID, frame }),
		});
		if (!res.ok) {
			const t = await res.text().catch(() => '');
			console.warn(`[agent-forge] push ${res.status}: ${t.slice(0, 160)}`);
		}
	} catch (err) {
		console.warn('[agent-forge] push failed:', err?.message || err);
	}
}

function pushNarration(activity) {
	console.log(`[agent-forge] ${activity}`);
	return pushFrame({ activity, type: 'analysis' });
}

async function forgeOne(raw) {
	const valid = validatePrompt(raw);
	if (!valid.ok) {
		console.warn(`[agent-forge] skipping prompt: ${valid.reason}`);
		return;
	}
	const { prompt, trimmed } = clampPrompt(raw);
	if (trimmed) console.log(`[agent-forge] prompt trimmed to the TRELLIS window: "${prompt}"`);

	await pushNarration(forgeStageNarration({ status: 'submitting' }));

	let result;
	try {
		result = await runForge({
			base: FORGE_BASE,
			prompt,
			tier: TIER,
			onStage: (state) => pushNarration(forgeStageNarration(state)),
		});
	} catch (err) {
		await pushNarration(`Forge failed: ${err?.message || err}. Try a more concrete prompt.`);
		console.error('[agent-forge] forge failed:', err?.message || err);
		return;
	}

	// Final frame: narration + GLB sidecar. Every connected viewer loads & animates it.
	const frame = finalForgeFrame({
		prompt,
		glbUrl: result.glbUrl,
		viewerUrl: result.viewerUrl,
		tier: result.tier || TIER,
		backend: result.backend,
		durable: result.durable,
	});
	await pushFrame(frame);
	console.log(`[agent-forge] forged GLB: ${result.glbUrl}`);
}

async function main() {
	if (!AGENT_ID || !AGENT_JWT) {
		console.error('[agent-forge] AGENT_ID and AGENT_JWT are required.');
		process.exit(1);
	}
	const prompts = parsePrompts();
	if (!prompts.length) {
		console.error('[agent-forge] set FORGE_PROMPT="…" (or FORGE_PROMPTS="a|b|c") and re-run.');
		process.exit(1);
	}
	console.log(`[agent-forge] casting onto agent ${AGENT_ID} via ${FORGE_BASE} (tier=${TIER}); ${prompts.length} prompt(s).`);
	for (const p of prompts) {
		await forgeOne(p);
	}
	console.log('[agent-forge] done.');
}

main().catch((err) => {
	console.error('[agent-forge] fatal:', err);
	process.exit(1);
});
