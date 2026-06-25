// JSON-RPC dispatch for the FREE 3D Studio MCP server — binds the shared,
// payment-free dispatcher (api/_lib/mcp-dispatch.js) to this server's catalog.
// No scope checks, no x402: every tool is free and operator-funded, bounded by
// the per-IP rate limits in api/mcp-studio.js.
import { makeDispatcher, PROTOCOL_VERSION } from '../_lib/mcp-dispatch.js';
import { TOOL_CATALOG, TOOLS } from './catalog.js';

export { PROTOCOL_VERSION };

const INSTRUCTIONS = [
	'three.ws 3D Studio turns text or images into downloadable, interactive 3D models — for free.',
	'forge_free(prompt) makes a textured 3D model from text (fast, free TRELLIS lane).',
	'mesh_forge(prompt | image_url | image_urls) makes a mesh from text, an image, or 1–4 multi-view images.',
	'text_to_avatar(prompt | image_url) makes a 3D avatar. rig_mesh(glb_url) adds a skeleton so a model can',
	'animate. forge_avatar(prompt | image_url) does generate + rig in one call. Every tool returns a GLB URL',
	'under `glbUrl`, a viewer link, and an inline <model-viewer> artifact — display that as an interactive 3D',
	'preview. Generation is asynchronous server-side and can take 30–180s; the call returns when the model is',
	'ready.',
].join(' ');

export const dispatch = makeDispatcher({
	serverInfo: { name: 'three-ws-3d-studio-free', version: '1.0.0' },
	instructions: INSTRUCTIONS,
	catalog: TOOL_CATALOG,
	tools: TOOLS,
	logName: 'mcp-studio',
});
