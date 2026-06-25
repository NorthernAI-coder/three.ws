// three.ws 3D Studio (free) — tool catalog + handlers.
//
// Exactly five generation tools, all FREE (no x402, no wallet, no API key): the
// platform's server-side keys cover provider cost via /api/forge (the public,
// auth-free twin of the paid pipeline). Responses carry ONLY what a client needs
// to show the model — a GLB URL, a viewer link, the kind, and the prompt — with
// every internal identifier (job id, creation id, prediction id, backend name,
// trace) stripped, per OpenAI's data-minimization policy. Each tool links the
// Apps SDK widget via _meta["openai/outputTemplate"] and returns structuredContent
// the widget renders. No coin, token, wallet, or payment surface anywhere.

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { assertSafePublicUrl, SsrfBlockedError } from '../_lib/ssrf-guard.js';
import { checkPromptSafety } from './safety.js';
import {
	originFromReq,
	viewerUrl,
	generate,
	rig,
	directPrompt,
} from './forge-client.js';
import { COMPONENT_URI } from './component.js';

const VALID_TIER = new Set(['draft', 'standard', 'high']);

// ── result helpers ──────────────────────────────────────────────────────────

// Minimal, identifier-free success envelope. structuredContent is the contract
// the widget + model read; content is the human/agent-readable narration.
function ok({ glbUrl, base, kind, prompt, rigged }) {
	const structured = {
		kind,
		glbUrl,
		viewerUrl: viewerUrl(base, glbUrl),
		format: 'glb',
		...(prompt ? { prompt } : {}),
		...(rigged ? { rigged: true } : {}),
	};
	const label = rigged ? 'rigged 3D model' : '3D model';
	return {
		content: [
			{
				type: 'text',
				text: `Generated a ${label} (GLB). View it: ${structured.viewerUrl}\nDownload: ${glbUrl}`,
			},
		],
		structuredContent: structured,
	};
}

function toolError(message) {
	return {
		content: [{ type: 'text', text: message }],
		structuredContent: { error: true, message },
		isError: true,
	};
}

// Map a coded forge-client failure to a clean, user-facing message — never leak
// provider internals, hostnames, or stack text.
function failureMessage(err) {
	switch (err?.code) {
		case 'timeout':
			return 'Generation is taking longer than expected. Please try again.';
		case 'busy':
			return 'The 3D generator is busy right now. Please try again in a moment.';
		case 'not_configured':
			return 'This capability is temporarily unavailable. Please try again later.';
		case 'generation_failed':
			return 'Generation failed for this prompt. Try rephrasing or simplifying it.';
		default:
			return 'Could not generate the model right now. Please try again.';
	}
}

async function guardImage(url) {
	if (!url) return;
	try {
		await assertSafePublicUrl(url);
	} catch (err) {
		if (err instanceof SsrfBlockedError) throw Object.assign(new Error('That image URL is not allowed.'), { userMessage: true });
		throw err;
	}
}

// Compact humanoid heuristic for the avatar gate — auto-rigging assumes a biped.
// A clearly non-humanoid subject is steered to mesh generation instead of
// silently wasting a rig pass. Conservative: only obvious objects/quadrupeds
// short-circuit; ambiguous prompts proceed.
const NON_HUMANOID = /\b(chair|sofa|couch|table|desk|lamp|car|truck|vehicle|building|house|tree|plant|sword|gun|bottle|cup|mug|phone|laptop|rock|stone|food|fruit|flower|dog|cat|horse|cow|fish|bird|dragon|snake|spider|dinosaur)\b/i;
const HUMANOID = /\b(human|person|man|woman|boy|girl|character|avatar|hero|warrior|knight|robot|android|figure|mascot|humanoid|biped|wizard|elf|orc|zombie|ninja|soldier|astronaut)\b/i;

function looksNonHumanoid(prompt) {
	const t = String(prompt || '');
	return NON_HUMANOID.test(t) && !HUMANOID.test(t);
}

// ── handlers ────────────────────────────────────────────────────────────────

async function handleForgeFree(args, _auth, req) {
	const base = originFromReq(req);
	const prompt = String(args.prompt || '').trim();
	if (prompt.length < 3) return toolError('Provide a text prompt of at least 3 characters.');
	const safety = checkPromptSafety(prompt);
	if (!safety.allowed) return toolError(safety.message);
	const tier = VALID_TIER.has(args.tier) ? args.tier : 'draft';
	let job;
	try {
		job = await generate(base, { prompt, backend: 'nvidia', path: 'image', tier }, { timeoutEnv: 'STUDIO_FORGE_TIMEOUT_MS' });
	} catch (err) {
		return toolError(failureMessage(err));
	}
	if (job._timedOut || !job.glb_url) return toolError('Generation is taking longer than expected. Please try again.');
	return ok({ glbUrl: job.glb_url, base, kind: 'model', prompt });
}

async function handleTextToAvatar(args, _auth, req) {
	const base = originFromReq(req);
	const prompt = String(args.prompt || '').trim();
	const imageUrl = args.image_url ? String(args.image_url).trim() : '';
	if (!prompt && !imageUrl) return toolError('Provide a text prompt or a reference image_url.');
	if (prompt) {
		const safety = checkPromptSafety(prompt);
		if (!safety.allowed) return toolError(safety.message);
	}
	try {
		await guardImage(imageUrl);
	} catch (err) {
		return toolError(err.userMessage ? err.message : 'That image URL could not be used.');
	}
	let job;
	try {
		job = await generate(
			base,
			{ prompt: prompt || undefined, imageUrls: imageUrl ? [imageUrl] : undefined, aspect: '1:1' },
			{ timeoutEnv: 'STUDIO_FORGE_TIMEOUT_MS' },
		);
	} catch (err) {
		return toolError(failureMessage(err));
	}
	if (job._timedOut || !job.glb_url) return toolError('Generation is taking longer than expected. Please try again.');
	return ok({ glbUrl: job.glb_url, base, kind: 'avatar', prompt: prompt || undefined });
}

const MESH_DIRECTOR =
	"You are a 3D asset art director. Rewrite the user's idea into ONE concise prompt for a text-to-3D " +
	'generator. Describe a SINGLE isolated subject on a plain background, naming form, materials, color, and ' +
	'surface detail. No scenes, no multiple objects, no text or logos, no background. Output ONLY the rewritten ' +
	'prompt as a single line.';

async function handleMeshForge(args, _auth, req) {
	const base = originFromReq(req);
	const prompt = String(args.prompt || '').trim();
	const imageUrl = args.image_url ? String(args.image_url).trim() : '';
	if (!prompt && !imageUrl) return toolError('Provide a text prompt or a reference image_url.');
	if (prompt) {
		const safety = checkPromptSafety(prompt);
		if (!safety.allowed) return toolError(safety.message);
	}
	try {
		await guardImage(imageUrl);
	} catch (err) {
		return toolError(err.userMessage ? err.message : 'That image URL could not be used.');
	}
	// Granite prompt director (text mode only; fail-soft — original prompt on any failure).
	let effective = prompt;
	if (prompt && !imageUrl) {
		const directed = await directPrompt(base, MESH_DIRECTOR, prompt);
		if (directed) effective = directed;
	}
	let job;
	try {
		job = await generate(
			base,
			{ prompt: effective || undefined, imageUrls: imageUrl ? [imageUrl] : undefined, aspect: '1:1' },
			{ timeoutEnv: 'STUDIO_FORGE_TIMEOUT_MS' },
		);
	} catch (err) {
		return toolError(failureMessage(err));
	}
	if (job._timedOut || !job.glb_url) return toolError('Generation is taking longer than expected. Please try again.');
	return ok({ glbUrl: job.glb_url, base, kind: 'mesh', prompt: prompt || undefined });
}

async function handleRigMesh(args, _auth, req) {
	const base = originFromReq(req);
	const glbUrl = String(args.glb_url || '').trim();
	if (!/^https?:\/\//i.test(glbUrl)) return toolError('Provide an http(s) URL to a GLB mesh to rig.');
	try {
		await guardImage(glbUrl);
	} catch (err) {
		return toolError(err.userMessage ? err.message : 'That GLB URL could not be used.');
	}
	let job;
	try {
		job = await rig(base, glbUrl, { timeoutEnv: 'STUDIO_RIG_TIMEOUT_MS' });
	} catch (err) {
		return toolError(failureMessage(err));
	}
	if (job._timedOut || !job.glb_url) return toolError('Rigging is taking longer than expected. Please try again.');
	return ok({ glbUrl: job.glb_url, base, kind: 'rigged model', rigged: true });
}

const AVATAR_DIRECTOR =
	"You are a 3D character art director. Rewrite the user's idea into ONE concise prompt for a text-to-3D " +
	'generator that will be auto-rigged. Describe a SINGLE full-body humanoid character standing in a neutral ' +
	'pose with arms slightly away from the body, on a plain background. Name body type, outfit, materials, ' +
	'colors, and key features. No scene, no props across the body, no multiple characters, no text. Output ONLY ' +
	'the rewritten prompt as a single line.';

async function handleForgeAvatar(args, _auth, req) {
	const base = originFromReq(req);
	const prompt = String(args.prompt || '').trim();
	const imageUrl = args.image_url ? String(args.image_url).trim() : '';
	if (!prompt && !imageUrl) return toolError('Provide a text prompt or a reference image_url.');
	if (prompt) {
		const safety = checkPromptSafety(prompt);
		if (!safety.allowed) return toolError(safety.message);
	}
	if (prompt && !imageUrl && args.allow_non_humanoid !== true && looksNonHumanoid(prompt)) {
		return toolError(
			'That looks like an object rather than a character. Auto-rigging needs a humanoid figure — use the 3D mesh generator for objects, or set allow_non_humanoid to override.',
		);
	}
	try {
		await guardImage(imageUrl);
	} catch (err) {
		return toolError(err.userMessage ? err.message : 'That image URL could not be used.');
	}
	// Stage 1 — generate the mesh (Granite director in text mode, fail-soft).
	let effective = prompt;
	if (prompt && !imageUrl) {
		const directed = await directPrompt(base, AVATAR_DIRECTOR, prompt);
		if (directed) effective = directed;
	}
	let gen;
	try {
		gen = await generate(
			base,
			{ prompt: effective || undefined, imageUrls: imageUrl ? [imageUrl] : undefined, aspect: '1:1' },
			{ timeoutEnv: 'STUDIO_FORGE_TIMEOUT_MS' },
		);
	} catch (err) {
		return toolError(failureMessage(err));
	}
	if (gen._timedOut || !gen.glb_url) return toolError('Generation is taking longer than expected. Please try again.');

	// Stage 2 — auto-rig the generated mesh.
	let rigged;
	try {
		rigged = await rig(base, gen.glb_url, { timeoutEnv: 'STUDIO_RIG_TIMEOUT_MS' });
	} catch (err) {
		// Generation succeeded but rigging failed — hand back the (unrigged) mesh so
		// the work isn't lost, and say so plainly.
		return {
			content: [
				{
					type: 'text',
					text: `Generated the mesh but auto-rigging failed (${failureMessage(err)}). You can still use the model: ${viewerUrl(base, gen.glb_url)}`,
				},
			],
			structuredContent: {
				kind: 'mesh',
				glbUrl: gen.glb_url,
				viewerUrl: viewerUrl(base, gen.glb_url),
				format: 'glb',
				...(prompt ? { prompt } : {}),
			},
		};
	}
	if (rigged._timedOut || !rigged.glb_url) return toolError('Rigging is taking longer than expected. Please try again.');
	return ok({ glbUrl: rigged.glb_url, base, kind: 'avatar', prompt: prompt || undefined, rigged: true });
}

// ── definitions ─────────────────────────────────────────────────────────────

const GEN_ANNOTATIONS = {
	readOnlyHint: false, // tools create a new hosted asset
	destructiveHint: false, // they never modify or delete anything
	idempotentHint: false, // same prompt → a fresh, different mesh each call
	openWorldHint: true, // work runs against external model APIs
};

function widgetMeta(invoking, invoked) {
	return {
		'openai/outputTemplate': COMPONENT_URI,
		'openai/toolInvocation/invoking': invoking,
		'openai/toolInvocation/invoked': invoked,
		'openai/widgetAccessible': true,
	};
}

const DEFS = [
	{
		name: 'forge_free',
		title: 'Generate a 3D model from text',
		description:
			'Turn a text prompt into a textured, downloadable 3D model (GLB) — free. Describe a single object, ' +
			'character, or creature; the studio generates an interactive model you can rotate, view, and download. ' +
			'Choose a quality tier (draft = fast, standard, high). Renders inline in an interactive 3D viewer.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['prompt'],
			properties: {
				prompt: {
					type: 'string',
					minLength: 3,
					maxLength: 1000,
					description: 'Description of the single object or character to model, e.g. "a friendly round robot mascot, glossy white plastic".',
				},
				tier: {
					type: 'string',
					enum: ['draft', 'standard', 'high'],
					description: 'Detail level: draft (fast, default), standard, or high. Higher tiers take longer.',
				},
			},
		},
		annotations: GEN_ANNOTATIONS,
		_meta: widgetMeta('Generating your 3D model…', 'Here is your 3D model'),
		handler: handleForgeFree,
	},
	{
		name: 'text_to_avatar',
		title: 'Generate a 3D avatar',
		description:
			'Generate a textured 3D avatar (GLB) from a text description or a reference image URL. Best for ' +
			'characters and figures. Renders inline in an interactive 3D viewer.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				prompt: { type: 'string', maxLength: 1000, description: 'Description of the avatar to generate.' },
				image_url: { type: 'string', format: 'uri', description: 'Optional http(s) URL to a reference image to reconstruct in 3D.' },
			},
		},
		annotations: GEN_ANNOTATIONS,
		_meta: widgetMeta('Generating your avatar…', 'Here is your avatar'),
		handler: handleTextToAvatar,
	},
	{
		name: 'mesh_forge',
		title: 'Generate a 3D mesh (art-directed)',
		description:
			'Generate a textured 3D mesh (GLB) from a text prompt or a reference image URL. In text mode an AI ' +
			'art-director first refines your prompt into an optimized single-subject spec for higher mesh quality. ' +
			'Renders inline in an interactive 3D viewer.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				prompt: { type: 'string', maxLength: 1000, description: 'Description of the single object to model.' },
				image_url: { type: 'string', format: 'uri', description: 'Optional http(s) URL to a reference image to reconstruct directly.' },
			},
		},
		annotations: GEN_ANNOTATIONS,
		_meta: widgetMeta('Generating your 3D mesh…', 'Here is your 3D mesh'),
		handler: handleMeshForge,
	},
	{
		name: 'rig_mesh',
		title: 'Rig a 3D model for animation',
		description:
			'Auto-rig a static 3D model (GLB) into an animation-ready model: adds a humanoid skeleton and skin ' +
			'weights so it can be posed and animated. Provide the GLB URL of a model (e.g. one generated by the ' +
			'other tools). Renders the rigged result inline in an interactive 3D viewer.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['glb_url'],
			properties: {
				glb_url: { type: 'string', format: 'uri', description: 'http(s) URL to the static GLB mesh to rig.' },
			},
		},
		annotations: GEN_ANNOTATIONS,
		_meta: widgetMeta('Rigging your model…', 'Here is your rigged model'),
		handler: handleRigMesh,
	},
	{
		name: 'forge_avatar',
		title: 'Generate a rigged, animation-ready avatar',
		description:
			'Generate a rigged, animation-ready 3D avatar (GLB) from a single text prompt or a reference image — ' +
			'in one step. Generates the mesh, then auto-rigs it with a humanoid skeleton so it is ready to pose and ' +
			'animate. Best for characters; objects are steered to the mesh generator. Renders inline in an ' +
			'interactive 3D viewer.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				prompt: { type: 'string', maxLength: 1000, description: 'Description of the character/avatar to generate.' },
				image_url: { type: 'string', format: 'uri', description: 'Optional http(s) URL to a reference image to reconstruct in 3D.' },
				allow_non_humanoid: { type: 'boolean', description: 'Set true to rig a non-humanoid subject anyway (rigging assumes a humanoid figure).' },
			},
		},
		annotations: GEN_ANNOTATIONS,
		_meta: widgetMeta('Generating your rigged avatar…', 'Here is your rigged avatar'),
		handler: handleForgeAvatar,
	},
];

// Schemas for tools/list — strip the handler (and any server-only field).
export const TOOL_CATALOG = DEFS.map(({ handler: _h, ...schema }) => schema);

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: true, strict: false });
addFormats(ajv);

export const TOOLS = Object.fromEntries(
	DEFS.map(({ name, handler, inputSchema }) => [name, { handler, validate: inputSchema ? ajv.compile(inputSchema) : null }]),
);

export const TOOL_NAMES = DEFS.map((d) => d.name);
