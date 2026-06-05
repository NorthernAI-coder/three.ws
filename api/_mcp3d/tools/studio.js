// three.ws 3D Studio MCP — generation tools.
//
// text_to_3d / image_to_3d submit a reconstruction job and return a job handle.
// generation_status polls that job. preview_3d renders any GLB inline.
// remove_background strips image backgrounds (rembg/BRIA RMBG-2.0).
// remesh_model converts, simplifies, and repairs meshes.
// retexture_model paints a new texture onto a mesh from a text prompt.

import { limits } from '../../_lib/rate-limit.js';
import { assertSafePublicUrl } from '../../_lib/ssrf-guard.js';
import { createRegenProvider as createReplicateProvider } from '../../_providers/replicate.js';
import { createRegenProvider as createGcpProvider } from '../../_providers/gcp.js';
import { textToImage } from '../text-to-image.js';
import {
	renderModelViewerHtml,
	safeCssValue,
	safeCssLength,
	safeHttpsUrl,
} from '../../_mcp/render.js';

function rpcError(code, message, data) {
	const e = new Error(message);
	e.code = code;
	e.data = data;
	return e;
}

function rateKey(auth) {
	return auth.userId || auth.rateKey || 'anon';
}

async function enforce(limiter, auth) {
	const rl = await limiter(rateKey(auth));
	if (!rl.success) {
		throw rpcError(-32000, 'rate_limited', {
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}
}

// Resolve the best available provider for a given mode.
// GCP takes priority when the service URL is configured for that mode;
// falls back to Replicate for the standard reconstruct/remesh/retex/rerig modes.
function regenProvider(mode = 'reconstruct') {
	const gcpKey = process.env?.GCP_RECONSTRUCTION_KEY;
	if (gcpKey) {
		try {
			const gcp = createGcpProvider();
			if (gcp.supportsMode(mode)) return gcp;
		} catch {
			// fall through to Replicate
		}
	}
	try {
		return createReplicateProvider();
	} catch (err) {
		throw rpcError(-32000, '3D generation is not configured', { reason: err.message });
	}
}

// Validate via the shared DNS-resolving SSRF guard: https-only, the hostname is
// resolved and every A/AAAA record is checked against the full private/loopback/
// link-local/ULA/IPv4-mapped/metadata blocklist (covering 172.16/12, [::1],
// fc00::/7, fe80::/10, ::ffff: and decimal/hex IP encodings the old ad-hoc
// prefix checks missed). Async because it performs DNS resolution.
async function isPublicHttpsUrl(s) {
	try {
		await assertSafePublicUrl(String(s), { allowHttp: false });
		return true;
	} catch {
		return false;
	}
}

const POLL_HINT =
	'Call generation_status with this job_id to check progress. ' +
	'Reconstruction typically finishes in 30–90 seconds.';

function viewerArtifact({ glbUrl, name, options = {} }) {
	const html = renderModelViewerHtml({
		src: glbUrl,
		name: name || '3D model',
		poster: safeHttpsUrl(options.poster),
		background: safeCssValue(options.background, 'transparent'),
		height: safeCssLength(options.height, '480px'),
		width: safeCssLength(options.width, '100%'),
		autoRotate: options.auto_rotate !== false,
		ar: options.ar !== false,
		cameraOrbit: safeCssValue(options.camera_orbit, ''),
	});
	return {
		type: 'resource',
		resource: { uri: glbUrl, mimeType: 'text/html', text: html },
	};
}

export const toolDefs = [
	{
		name: 'text_to_3d',
		title: 'Generate a 3D model from a text prompt',
		description:
			'Turn a text description into a textured 3D model (GLB). Runs a fast text-to-image pass, then reconstructs a mesh from that image with Microsoft TRELLIS. Returns a job_id (poll with generation_status) plus the intermediate preview image. Best results: a single, clearly described object — "a worn leather armchair", "a low-poly red fox", "a sci-fi helmet".',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					minLength: 3,
					maxLength: 1000,
					description: 'What to generate. Describe one subject clearly.',
				},
				aspect_ratio: {
					type: 'string',
					enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
					default: '1:1',
					description: 'Aspect ratio of the intermediate reference image.',
				},
			},
			required: ['prompt'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			const provider = regenProvider();
			const { imageUrl, model } = await textToImage(args.prompt, {
				aspectRatio: args.aspect_ratio || '1:1',
			});
			const job = await provider.submit({
				mode: 'reconstruct',
				params: { image: imageUrl, prompt: args.prompt },
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Started generating a 3D model for "${args.prompt}".\n` +
							`Reference image: ${imageUrl}\n` +
							`Job ID: ${job.extJobId}\n${POLL_HINT}`,
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					prompt: args.prompt,
					preview_image_url: imageUrl,
					text_to_image_model: model,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'image_to_3d',
		title: 'Reconstruct a 3D model from an image',
		description:
			'Reconstruct a textured 3D model (GLB) from a single reference image URL using Microsoft TRELLIS. Returns a job_id to poll with generation_status. The cleaner the input — one subject, plain background, even lighting — the better the mesh.',
		inputSchema: {
			type: 'object',
			properties: {
				image_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the reference image (PNG/JPG/WebP).',
				},
				prompt: {
					type: 'string',
					maxLength: 1000,
					description: 'Optional text hint passed to the reconstruction model.',
				},
			},
			required: ['image_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.image_url))) {
				return {
					content: [{ type: 'text', text: 'Error: image_url must be a public https URL.' }],
					isError: true,
				};
			}
			const provider = regenProvider();
			const job = await provider.submit({
				mode: 'reconstruct',
				params: { image: args.image_url, prompt: args.prompt },
			});
			return {
				content: [
					{
						type: 'text',
						text: `Started reconstructing a 3D model from the image.\nJob ID: ${job.extJobId}\n${POLL_HINT}`,
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_image_url: args.image_url,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'generation_status',
		title: 'Check a 3D generation job',
		description:
			'Poll a text_to_3d or image_to_3d job by its job_id. While running it reports the status; when finished it returns the GLB download URL and an inline <model-viewer> artifact — display that text/html resource as an interactive 3D artifact.',
		inputSchema: {
			type: 'object',
			properties: {
				job_id: {
					type: 'string',
					minLength: 1,
					maxLength: 200,
					description: 'The job_id returned by text_to_3d or image_to_3d.',
				},
			},
			required: ['job_id'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dStatus, auth);
			const provider = regenProvider();
			const result = await provider.status(args.job_id);

			if (result.status === 'done' && result.resultGlbUrl) {
				const glbUrl = result.resultGlbUrl;
				return {
					content: [
						{
							type: 'text',
							text:
								`Your 3D model is ready.\nGLB: ${glbUrl}\n` +
								'Display the attached text/html resource as an inline 3D artifact.',
						},
						viewerArtifact({ glbUrl, name: '3D model' }),
					],
					structuredContent: { job_id: args.job_id, status: 'done', glb_url: glbUrl },
				};
			}

			if (result.status === 'failed') {
				return {
					content: [
						{ type: 'text', text: `Generation failed: ${result.error || 'unknown error'}` },
					],
					structuredContent: { job_id: args.job_id, status: 'failed', error: result.error || null },
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: `Still ${result.status}. ${POLL_HINT}`,
					},
				],
				structuredContent: { job_id: args.job_id, status: result.status },
			};
		},
	},
	{
		name: 'preview_3d',
		title: 'Preview any GLB as an interactive 3D artifact',
		description:
			'Render any public GLB URL as an inline <model-viewer> HTML artifact — orbit controls, AR on mobile, auto-rotate. Display the returned text/html resource as an inline 3D artifact. Use it to view a generated model, or any GLB on the web.',
		inputSchema: {
			type: 'object',
			properties: {
				glb_url: { type: 'string', format: 'uri', description: 'Public https URL of a .glb file.' },
				auto_rotate: { type: 'boolean', default: true },
				ar: { type: 'boolean', default: true },
				background: {
					type: 'string',
					default: 'transparent',
					description: 'CSS background color or gradient.',
				},
				height: { type: 'string', default: '480px' },
				width: { type: 'string', default: '100%' },
				camera_orbit: {
					type: 'string',
					description: 'model-viewer camera-orbit value, e.g. "0deg 80deg 2m".',
				},
			},
			required: ['glb_url'],
			additionalProperties: false,
		},
		async handler(args) {
			if (!(await isPublicHttpsUrl(args.glb_url))) {
				return {
					content: [{ type: 'text', text: 'Error: glb_url must be a public https URL.' }],
					isError: true,
				};
			}
			return {
				content: [
					{
						type: 'text',
						text: 'Display the attached text/html resource as an inline 3D artifact.',
					},
					viewerArtifact({ glbUrl: args.glb_url, name: '3D model', options: args }),
				],
				structuredContent: { glb_url: args.glb_url },
			};
		},
	},
	{
		name: 'remove_background',
		title: 'Remove the background from an image',
		description:
			'Strip the background from a photo or illustration using BRIA RMBG-2.0 (Apache-2.0). Returns a PNG with a transparent background — useful for preparing clean inputs before image_to_3d reconstruction.',
		inputSchema: {
			type: 'object',
			properties: {
				image_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source image (PNG/JPG/WebP).',
				},
				model: {
					type: 'string',
					enum: ['rmbg2', 'u2net', 'isnet', 'u2net_human_seg', 'silueta'],
					default: 'rmbg2',
					description: 'Background removal model. rmbg2 is highest quality; u2net_human_seg is optimised for people.',
				},
			},
			required: ['image_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.image_url))) {
				return {
					content: [{ type: 'text', text: 'Error: image_url must be a public https URL.' }],
					isError: true,
				};
			}
			const provider = regenProvider('rembg');
			const job = await provider.submit({
				mode: 'rembg',
				sourceUrl: args.image_url,
				params: { model: args.model || 'rmbg2' },
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Background removal started.\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 3–10 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_image_url: args.image_url,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'remesh_model',
		title: 'Remesh, simplify, repair, or convert a 3D model',
		description:
			'Process an existing GLB/OBJ/STL/PLY mesh: fix holes and degenerate geometry, reduce face count via quadric decimation, or convert to a different format. Returns a clean GLB (or the requested format) job_id to poll with generation_status.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source mesh (GLB/OBJ/FBX/STL/PLY).',
				},
				operation: {
					type: 'string',
					enum: ['full', 'simplify', 'repair', 'convert'],
					default: 'full',
					description: 'full = repair + simplify; simplify = face reduction only; repair = hole-fill + normal fix; convert = format change only.',
				},
				target_faces: {
					type: 'integer',
					minimum: 1000,
					maximum: 500000,
					default: 50000,
					description: 'Target polygon count for simplification.',
				},
				output_format: {
					type: 'string',
					enum: ['glb', 'obj', 'stl', 'ply', 'usdz', '3mf'],
					default: 'glb',
				},
			},
			required: ['mesh_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [{ type: 'text', text: 'Error: mesh_url must be a public https URL.' }],
					isError: true,
				};
			}
			const provider = regenProvider('remesh');
			const job = await provider.submit({
				mode: 'remesh',
				sourceUrl: args.mesh_url,
				params: {
					operation: args.operation || 'full',
					target_faces: args.target_faces || 50_000,
					output_format: args.output_format || 'glb',
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Mesh processing started (${args.operation || 'full'}).\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 10–60 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					operation: args.operation || 'full',
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'retexture_model',
		title: 'Paint a new texture onto a 3D model from a text prompt',
		description:
			'Generate a fresh texture for an untextured or poorly-textured GLB using SDXL + ControlNet depth. Renders the mesh from 8 viewpoints, generates coherent texture views guided by your prompt, and back-projects them onto the UV atlas. Returns a job_id to poll with generation_status.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source GLB mesh.',
				},
				prompt: {
					type: 'string',
					minLength: 3,
					maxLength: 500,
					description: 'Texture description, e.g. "worn leather armour, dark brown, scratched metal buckles".',
				},
				negative_prompt: {
					type: 'string',
					maxLength: 200,
					default: 'blurry, low quality, distorted, watermark',
				},
				num_views: {
					type: 'integer',
					enum: [4, 8],
					default: 8,
					description: '4 = faster; 8 = better coverage.',
				},
				texture_size: {
					type: 'integer',
					enum: [512, 1024, 2048],
					default: 1024,
				},
			},
			required: ['mesh_url', 'prompt'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [{ type: 'text', text: 'Error: mesh_url must be a public https URL.' }],
					isError: true,
				};
			}
			const provider = regenProvider('retex');
			const job = await provider.submit({
				mode: 'retex',
				sourceUrl: args.mesh_url,
				params: {
					prompt: args.prompt,
					negative_prompt: args.negative_prompt,
					num_views: args.num_views || 8,
					texture_size: args.texture_size || 1024,
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Texture generation started for "${args.prompt}".\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 2–5 minutes.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					prompt: args.prompt,
					eta_seconds: job.eta,
				},
			};
		},
	},
];
