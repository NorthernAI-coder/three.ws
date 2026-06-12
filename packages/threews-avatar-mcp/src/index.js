#!/usr/bin/env node
// @three-ws/avatar-mcp — stdio MCP server for three.ws 3D avatars.
//
// Drops a live, persistent three.ws 3D avatar into any MCP client (Claude
// Desktop/Code, Cursor, …): render it inline as an interactive, rotatable
// model, get a ready-to-paste embed iframe, or fetch avatar metadata.
//
// Architecture: a thin, zero-config bridge to real three.ws public endpoints
// (/api/avatars, /api/users/:handle/avatar, /api/avatar/render, /avatar-embed,
// /viewer). Public and unlisted avatars need no API key. No mock data — every
// tool reads live from three.ws. Override the host with THREEWS_BASE_URL.
//
// Run standalone:  npx @three-ws/avatar-mcp
// Inspect:         npx -y @modelcontextprotocol/inspector npx @three-ws/avatar-mcp

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { buildTools } from './tools.js';
import { baseUrl, ThreewsError } from './threews.js';
import { UI_RESOURCE_URI, UI_MIME_TYPE, UI_RESOURCE_META, loadAppHtml } from './ui.js';

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require('../package.json');

const SERVER_NAME = 'three.ws-avatar-mcp';

async function main() {
	const tools = buildTools();
	const byName = new Map(tools.map((t) => [t.definition.name, t]));

	const server = new Server(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
			instructions:
				'three.ws 3D avatar tools. render_avatar shows a live, rotatable avatar inline ' +
				'(preview image + interactive model + embed URL); avatar_embed_code returns a ' +
				'paste-anywhere iframe; get_avatar returns metadata. Identify avatars by id, ' +
				'@handle, or a raw GLB url. Free and read-only — no API key for public avatars.',
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: tools.map((t) => t.definition),
	}));

	// MCP Apps UI resource: the interactive model-viewer iframe that render_avatar
	// declares via _meta.ui.resourceUri. _meta.ui.csp grants the sandbox the
	// origins it needs (model-viewer CDN + GLB hosts).
	server.setRequestHandler(ListResourcesRequestSchema, async () => ({
		resources: [
			{
				uri: UI_RESOURCE_URI,
				name: 'three.ws avatar viewer',
				description: 'Interactive 3D avatar viewer rendered inline by render_avatar.',
				mimeType: UI_MIME_TYPE,
				_meta: UI_RESOURCE_META,
			},
		],
	}));

	server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
		if (request.params.uri !== UI_RESOURCE_URI) {
			throw new Error(`Unknown resource: ${request.params.uri}`);
		}
		return {
			contents: [
				{
					uri: UI_RESOURCE_URI,
					mimeType: UI_MIME_TYPE,
					text: loadAppHtml(),
					_meta: UI_RESOURCE_META,
				},
			],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;
		const tool = byName.get(name);
		if (!tool) {
			return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
		}
		try {
			return await tool.handler(args || {});
		} catch (err) {
			const text =
				err instanceof ThreewsError
					? err.message
					: `Tool ${name} failed: ${err.message}`;
			return { isError: true, content: [{ type: 'text', text }] };
		}
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
	process.stderr.write(
		`[avatar-mcp] ${SERVER_NAME} v${SERVER_VERSION} ready — ${tools.length} tools via ${baseUrl()}\n`,
	);
}

main().catch((err) => {
	process.stderr.write(`[avatar-mcp] fatal: ${err?.stack || err}\n`);
	process.exit(1);
});
