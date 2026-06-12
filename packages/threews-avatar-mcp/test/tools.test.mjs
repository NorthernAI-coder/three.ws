// Smoke test: the tool surface enumerates correctly without secrets or network.
//
// Asserts the three tools exist with unique names, real descriptions, MCP
// ToolAnnotations (read-only), human titles, and that render_avatar declares
// its MCP Apps ui:// resource (SEP-1865) via _meta.ui.resourceUri.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTools } from '../src/tools.js';
import { UI_RESOURCE_URI, UI_MIME_TYPE, UI_RESOURCE_META } from '../src/ui.js';

const EXPECTED_TOOLS = ['render_avatar', 'avatar_embed_code', 'get_avatar'];

test('enumerates exactly the three avatar tools with unique names', () => {
	const tools = buildTools();
	assert.equal(tools.length, 3);
	const names = tools.map((t) => t.definition.name);
	assert.deepEqual([...new Set(names)].sort(), [...EXPECTED_TOOLS].sort());
});

test('every tool has a title, description, input schema, and handler', () => {
	for (const tool of buildTools()) {
		const def = tool.definition;
		assert.equal(typeof def.title, 'string', `${def.name} missing title`);
		assert.ok(def.title.length > 0, `${def.name} empty title`);
		assert.equal(typeof def.description, 'string', `${def.name} missing description`);
		assert.ok(def.description.length >= 20, `${def.name} description too short`);
		assert.equal(def.inputSchema?.type, 'object', `${def.name} missing object inputSchema`);
		assert.equal(typeof tool.handler, 'function', `${def.name} missing handler`);
	}
});

test('every tool is annotated read-only, idempotent, open-world', () => {
	for (const tool of buildTools()) {
		const { name, annotations } = tool.definition;
		assert.ok(annotations, `${name} missing annotations`);
		assert.equal(annotations.readOnlyHint, true, `${name} readOnlyHint`);
		assert.equal(annotations.idempotentHint, true, `${name} idempotentHint`);
		assert.equal(annotations.openWorldHint, true, `${name} openWorldHint`);
	}
});

test('render_avatar declares the MCP Apps ui:// resource', () => {
	const renderAvatar = buildTools().find((t) => t.definition.name === 'render_avatar');
	assert.ok(renderAvatar, 'render_avatar tool not found');
	assert.equal(renderAvatar.definition._meta?.ui?.resourceUri, UI_RESOURCE_URI);
	assert.match(UI_RESOURCE_URI, /^ui:\/\//, 'UI resource must use the ui:// scheme');
	assert.equal(UI_MIME_TYPE, 'text/html;profile=mcp-app');
	assert.ok(
		Array.isArray(UI_RESOURCE_META.ui?.csp?.resourceDomains) &&
			UI_RESOURCE_META.ui.csp.resourceDomains.length > 0,
		'UI resource must carry a CSP grant',
	);
});
