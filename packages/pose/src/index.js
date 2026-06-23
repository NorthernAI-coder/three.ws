// @three-ws/pose — a phrase → a deterministic seed + the full Euler
// joint-rotation map for a rigged 3D avatar. Thin client over the public,
// auth-free `pose_model` tool on the Streamable-HTTP MCP server at
// POST /api/mcp-3d (the SDK twin of the 3D Studio MCP server).
//
// The wire call is a standard JSON-RPC `tools/call`. The tool is pure local
// computation — it scores the prompt against an in-repo preset library, picks
// one, derives a seed, and returns the preset's pre-authored rotation map. No
// model inference, no GPU, nothing persisted; the same prompt always resolves
// to the same pose. See README.md for the full reference.

import { createHttp, ThreeWsError } from './http.js';
import { PRESETS, PRESET_GROUPS, getPresetById } from './pose-presets.js';

export { ThreeWsError, PaymentRequiredError, DEFAULT_BASE_URL } from './http.js';
export { PRESETS, PRESET_GROUPS } from './pose-presets.js';

const MCP_PATH = '/api/mcp-3d';
const TOOL_NAME = 'pose_model';
const PREVIEW_BASE = 'https://three.ws/pose';
const MAX_PROMPT = 500;

// The MCP server speaks Streamable HTTP: it may answer a tools/call with a
// JSON body or a single SSE frame, so we accept both content types.
const MCP_ACCEPT = 'application/json, text/event-stream';

/** Typed error for every @three-ws/pose failure. Mirrors ThreeWsError. */
export class PoseError extends ThreeWsError {
	constructor(message, opts = {}) {
		super(message, opts);
		this.name = 'PoseError';
	}
}

/**
 * Create a Pose client bound to a base URL, fetch, and optional auth.
 * For most callers the default export `poseSeed()` is enough; use this when
 * you want to reuse configuration (a payment-aware fetch for the paid MCP
 * lane, a custom origin) across many calls.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl]   API origin (default https://three.ws).
 * @param {typeof fetch} [options.fetch]  fetch implementation.
 * @param {string} [options.apiKey]    OAuth bearer — runs the call operator-funded (free).
 * @param {string} [options.previewBase]  base URL for the returned previewUrl.
 * @param {Record<string,string>} [options.headers]
 */
export function createPose(options = {}) {
	const request = createHttp(options);
	const previewBase = stripTrailingSlash(options.previewBase || PREVIEW_BASE);

	let nextId = 1;

	/**
	 * Resolve a natural-language pose description to a deterministic seed and the
	 * full joint-rotation map. `prompt` is a string, 1–500 characters.
	 */
	async function poseSeed(prompt, opts = {}) {
		const text = typeof prompt === 'string' ? prompt : '';
		if (text.length < 1 || text.length > MAX_PROMPT) {
			throw new PoseError(
				`poseSeed() needs a prompt of 1–${MAX_PROMPT} characters.`,
				{ code: 'invalid_prompt' },
			);
		}
		return callPoseModel(text, opts);
	}

	/**
	 * Skip selection and resolve a specific preset by id. Seeds with the preset
	 * id as the prompt, so the same preset always returns the same seed.
	 */
	async function presetPose(presetId, opts = {}) {
		if (!presetId || typeof presetId !== 'string' || !getPresetById(presetId)) {
			const known = PRESETS.map((p) => p.id).join(', ');
			throw new PoseError(
				`Unknown preset "${presetId}". Known presets: ${known}.`,
				{ code: 'invalid_prompt' },
			);
		}
		return callPoseModel(presetId, opts);
	}

	// One JSON-RPC tools/call to pose_model, shaped into a PoseResult.
	async function callPoseModel(prompt, opts) {
		const envelope = {
			jsonrpc: '2.0',
			id: nextId++,
			method: 'tools/call',
			params: { name: TOOL_NAME, arguments: { prompt } },
		};

		const payload = await request(MCP_PATH, {
			method: 'POST',
			headers: { accept: MCP_ACCEPT, ...(opts.headers || {}) },
			body: envelope,
			signal: opts.signal,
		});

		// JSON-RPC envelope: a tool error rides in `error`; a tool result that
		// itself failed rides in `result.isError`.
		if (payload?.error) {
			throw new PoseError(payload.error.message || 'The pose tool returned an error.', {
				code: 'tool_error',
				detail: payload.error.data ?? null,
				body: payload,
			});
		}
		const result = payload?.result;
		if (result?.isError) {
			const msg = result.content?.find((c) => c.type === 'text')?.text || 'The pose tool returned an error.';
			throw new PoseError(msg, { code: 'tool_error', body: payload });
		}
		const sc = result?.structuredContent;
		if (!sc || typeof sc !== 'object') {
			throw new PoseError('Unexpected empty response from the pose tool.', {
				code: 'tool_error',
				body: payload,
			});
		}
		return shape(sc, previewBase);
	}

	return { poseSeed, presetPose, listPresetGroups };
}

// A module-level default client for the zero-config path: `import { poseSeed }`.
let shared = null;
function defaultClient() {
	return (shared ||= createPose());
}

/** Resolve a phrase to a deterministic seed + full joint-rotation map. */
export function poseSeed(prompt, opts) {
	return defaultClient().poseSeed(prompt, opts);
}
/** Resolve a specific preset by id (skips prompt selection). */
export function presetPose(presetId, opts) {
	return defaultClient().presetPose(presetId, opts);
}

/**
 * The four pose groups, returned synchronously for menu scaffolding:
 * ['Standing', 'Action', 'Sitting & Floor', 'Expressive']. From the real
 * in-repo preset library — no network call.
 */
export function listPresetGroups() {
	return [...PRESET_GROUPS];
}

// Normalize the tool's snake_case structuredContent into the camelCase
// PoseResult, rebasing the preview URL onto the configured previewBase and
// keeping a `.raw` escape hatch.
function shape(sc, previewBase) {
	const presetId = sc.preset_id ?? null;
	const seed = sc.seed ?? null;
	const previewUrl =
		presetId && seed
			? `${previewBase}?seed=${encodeURIComponent(seed)}&preset=${encodeURIComponent(presetId)}`
			: (sc.preview_url ?? null);
	return {
		seed,
		presetId,
		presetLabel: sc.preset_label ?? null,
		group: sc.group ?? null,
		parameters: sc.parameters ?? {},
		previewUrl,
		match: sc.match ?? null,
		groups: Array.isArray(sc.groups) ? sc.groups : [...PRESET_GROUPS],
		raw: sc,
	};
}

function stripTrailingSlash(s) {
	return String(s).replace(/\/+$/, '');
}
