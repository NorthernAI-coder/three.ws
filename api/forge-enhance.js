// POST /api/forge-enhance — turn a terse object description into a prompt the
// text→3D pipeline (FLUX reference image → TRELLIS reconstruction) can actually
// render well. Single subject, centered, plain background, with the material,
// surface and lighting cues that make reconstruction sharp.
//
//   Body: { prompt: string }            // the user's rough description
//   200:  { prompt: string, original }  // the rewritten, model-ready prompt
//
// Runs on the same free-first LLM chain as every other text feature on the site
// (Groq / OpenRouter / NVIDIA lead; host's paid keys are last resort), so it
// costs the visitor nothing and never depends on them holding a key. When no
// provider is configured at all it returns 503 and the page quietly keeps the
// original prompt — enhancement is a boost, never a gate.

import { cors, method, wrap, error, readJson, json, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { llmComplete, LlmUnavailableError } from './_lib/llm.js';

const MAX_IN = 1000;
const MAX_OUT = 240;

const SYSTEM = `You rewrite a user's rough idea into ONE optimal prompt for an image-to-3D generator (a text-to-image model paints a reference image, then a photogrammetry-style model reconstructs a textured 3D mesh from it).

A great prompt for this pipeline describes a SINGLE physical object, centered, as if photographed for a product catalog. Rewrite the user's idea following every rule:
- Exactly one subject. If the user named several things, pick the most central one.
- Add concrete material, surface and color detail (e.g. "brushed aluminium", "worn oak", "matte ceramic glaze").
- Specify clean, even studio lighting and a plain, uncluttered background.
- Keep the object in a neutral, fully-visible resting pose. No actions, no motion, no people using it, no scenes or environments.
- Stay a compact noun phrase, not a sentence. No camera brands, no resolution tags, no artist names, no quotation marks.
- Keep it under 40 words.

Output ONLY the rewritten prompt as a single line of plain text. No preamble, no explanation, no markdown.`;

// Strip anything the model wraps around the prompt despite instructions: quotes,
// a "Prompt:" label, surrounding whitespace, stray line breaks. We keep it a
// single clean line so it drops straight into the composer.
function cleanPrompt(text) {
	let t = (text || '').trim();
	t = t.replace(/^(?:enhanced\s+)?prompt\s*[:\-—]\s*/i, '');
	t = t.replace(/\s+/g, ' ').trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) {
		t = t.slice(1, -1).trim();
	}
	t = t.replace(/[.\s]+$/, '').trim();
	return t;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	const rl = await limits.forgeEnhance(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req);
	const raw = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
	if (raw.length < 3) {
		return error(res, 400, 'prompt_too_short', 'Describe the object in a few words first.');
	}

	let result;
	try {
		result = await llmComplete({
			system: SYSTEM,
			user: raw.slice(0, MAX_IN),
			maxTokens: 160,
			track: { tool: 'forge-enhance', clientId: clientIp(req) },
		});
	} catch (err) {
		if (err instanceof LlmUnavailableError) {
			return error(res, 503, 'llm_unavailable', 'Prompt enhancement is not available right now.');
		}
		console.error('[forge-enhance] LLM failed', err.status || '', err.message);
		return error(res, 502, 'llm_failed', 'Could not enhance the prompt. Try again.');
	}

	let prompt = cleanPrompt(result.text);
	if (prompt.length > MAX_OUT) prompt = prompt.slice(0, MAX_OUT).replace(/\s\S*$/, '').trim();

	// A degenerate or empty rewrite is worse than the user's own words — fall back
	// rather than hand back something useless.
	if (prompt.length < 3) prompt = raw;

	return json(res, 200, { prompt, original: raw, provider: result.provider });
});
