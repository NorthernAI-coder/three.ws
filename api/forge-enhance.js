// POST /api/forge-enhance — turn a terse object description into a prompt the
// text→3D pipeline (FLUX reference image → TRELLIS reconstruction) can actually
// render well. Single subject, centered, plain background, with the material,
// surface and lighting cues that make reconstruction sharp.
//
//   Body: { prompt: string, style?: string, engine?: 'nemotron' }
//   200:  { prompt, original, negative_prompt, style_applied, provider, model }
//
// `style` is an optional hint that makes the rewrite consistent for a generation
// set (e.g. “low-poly game asset”, “photorealistic PBR”, “clay render”). When
// absent the director picks the most photorealistic, reconstruction-friendly phrasing.
//
// `negative_prompt` in the response is a ready-made comma-separated list of
// things the pipeline produces bad results for — pass it straight to providers
// that support it (Hunyuan3D, some Replicate models). Providers that ignore
// unknown params are unaffected.
//
// Runs on the same free-first LLM chain as every other text feature on the site
// (Groq / OpenRouter / NVIDIA lead; host's paid keys are last resort). When no
// provider is configured at all it returns 503 and the page quietly keeps the
// original prompt — enhancement is a boost, never a gate.

import { cors, method, wrap, error, readJson, json, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { llmComplete, LlmUnavailableError } from './_lib/llm.js';

const MAX_IN = 1000;
const MAX_OUT = 240;

// Negative prompts that apply to every 3D generation regardless of subject.
// These are the failure modes the TRELLIS / Hunyuan3D family most reliably
// produces on unclear inputs — listed once and appended to every response so
// callers don't have to remember them.
export const FORGE_NEGATIVE_PROMPT =
	'multiple objects, busy scene, background clutter, partial view, cut off, floating pieces, ' +
	'disconnected parts, transparent geometry, hollow interior, inside-out normals, ' +
	'flat image, 2D illustration, watermark, text overlay, blur';

// Style presets: a caller can pass `style` to keep generated-set consistency
// (“I want all my assets to look like low-poly game items”).
const STYLE_PRESETS = {
	photorealistic: 'photorealistic, PBR, physically-based rendering, 8K texture detail',
	lowpoly: 'low-poly, faceted surfaces, flat shading, stylized game asset',
	clay: 'matte clay render, smooth surfaces, uniform studio lighting, no shadows',
	stylized: 'stylized, illustrative 3D, clean hand-painted textures, vibrant colors',
	scifi: 'sci-fi industrial, matte metal panels, glowing accents, hard-surface details',
	fantasy: 'fantasy, hand-painted texture, slightly warm studio light, vivid surface detail',
};

function buildSystem(style) {
	const styleBlock =
		style && STYLE_PRESETS[style]
			? `\n- Apply this target aesthetic to every prompt you write: ${STYLE_PRESETS[style]}.`
			: '';
	return `You rewrite a user's rough idea into ONE optimal prompt for a text-to-3D pipeline \
(a diffusion model paints a reference image, then a photogrammetry-style model reconstructs \
a textured 3D mesh from it).

A great prompt for this pipeline describes a SINGLE, SOLID physical object with clear geometry, \
centered on a plain background as if shot for a product catalog. Rewrite the user's idea \
following every rule:
- Exactly one subject. If the user named several things, pick the most central solid object.
- Add concrete material, surface and color cues that photograph well AND reconstruct well, \
e.g. “brushed aluminium with visible machining marks”, “worn oak with tight grain”, \
“matte ceramic with slight subsurface glow”, “cast iron with rust-speckled patina”. \
Surface micro-detail helps the reconstruction model generate dense, clean geometry.
- Prefer opaque, solid materials (metal, wood, stone, ceramic, hard plastic). \
AVOID transparent, translucent, or reflective surfaces (glass, crystal, mirror, water) — \
they produce degenerate meshes in photogrammetry reconstructors.
- The silhouette must be distinct and self-contained: no thin wires, no loose hair, no fog, \
no overlapping objects. The reconstructor needs unambiguous depth cues.
- Specify soft, even studio lighting (e.g. “soft box lighting”, “diffuse white studio light”) \
and a plain white or light-grey background. Sharp shadows confuse depth estimation.
- Keep the object in a neutral, fully-visible resting pose. No actions, no motion, \
no people using it, no scenes or environments.
- Stay a compact noun phrase (10–35 words). No camera brands, resolution tags, artist names, \
or quotation marks.${styleBlock}

Output ONLY the rewritten prompt as a single line of plain text. No preamble, no explanation, \
no markdown, no extra lines.`;
}

// Strip anything the model wraps around the prompt despite instructions: quotes,
// a “Prompt:” label, surrounding whitespace, stray line breaks.
function cleanPrompt(text) {
	let t = (text || '').trim();
	t = t.replace(/^(?:enhanced\s+)?prompt\s*[:\-—]\s*/i, '');
	t = t.replace(/\s+/g, ' ').trim();
	if ((t.startsWith('”') && t.endsWith('”')) || (t.startsWith('“') && t.endsWith('”'))) {
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

	// Optional style preset — kept to the defined set so callers get consistency
	// without us injecting arbitrary text from user input into the system prompt.
	const style =
		typeof body?.style === 'string' && STYLE_PRESETS[body.style.toLowerCase().trim()]
			? body.style.toLowerCase().trim()
			: null;

	// Opt-in: route the refine through NVIDIA's Nemotron NIM (the /forge-spark
	// pipeline asks for this). Still falls back to the free chain on failure.
	const preferNvidia = body?.engine === 'nemotron';

	let result;
	try {
		result = await llmComplete({
			system: buildSystem(style),
			user: raw.slice(0, MAX_IN),
			maxTokens: 200,
			preferNvidia,
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

	// A degenerate or empty rewrite is worse than the user's own words — fall back.
	if (prompt.length < 3) prompt = raw;

	return json(res, 200, {
		prompt,
		original: raw,
		negative_prompt: FORGE_NEGATIVE_PROMPT,
		style_applied: style,
		provider: result.provider,
		model: result.model,
	});
});
