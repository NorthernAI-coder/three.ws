// Golden contract tripwire for the hosted MCP tool catalogs.
//
// The MCP servers ARE the product surface we submit to the Claude Connectors
// Directory and the OpenAI App Directory. A reviewer calls every tool and checks
// its title + annotations; an accidental change to a tool's name, title,
// annotations, or input schema can silently break a live listing. This test
// freezes each catalog's PUBLIC contract (handlers already stripped by the
// catalog's own map) into a committed snapshot, and enforces two store-review
// invariants that are easy to regress:
//
//   1. Every tool has a non-empty `title` (both directories require it).
//   2. Every tool sets `annotations.destructiveHint` EXPLICITLY — the MCP spec
//      defaults it to TRUE when omitted, which would mislabel a safe tool as
//      destructive in the client UI.
//
// Snapshots live in tests/__snapshots__/mcp-tool-contract.test.js.snap. When you
// intentionally change a tool's contract, re-run with `-u` and review the diff —
// that diff is exactly what a store reviewer would see change.

import { describe, it, expect } from 'vitest';

// Each hosted server exposes TOOL_CATALOG: the tools/list schema array with the
// internal `scope`/`handler` fields already removed.
import { TOOL_CATALOG as MAIN } from '../api/_mcp/catalog.js';
import { TOOL_CATALOG as STUDIO3D } from '../api/_mcp3d/catalog.js';
import { TOOL_CATALOG as AGENT } from '../api/_mcpagent/catalog.js';
import { TOOL_CATALOG as BAZAAR } from '../api/_mcpbazaar/catalog.js';
import { TOOL_CATALOG as IBM } from '../api/_mcpibm/catalog.js';

const SERVERS = {
	'_mcp': MAIN,
	'_mcp3d': STUDIO3D,
	'_mcpagent': AGENT,
	'_mcpbazaar': BAZAAR,
	'_mcpibm': IBM,
};

// Reduce a tool to its review-relevant contract. Description is intentionally
// excluded: copy edits to descriptions are routine and should not fail the gate,
// whereas name/title/annotations/inputSchema are the machine + reviewer contract.
function contractOf(tool) {
	return {
		name: tool.name,
		title: tool.title ?? null,
		annotations: tool.annotations ?? null,
		inputSchema: tool.inputSchema ?? null,
	};
}

function catalogContract(catalog) {
	return [...catalog]
		.map(contractOf)
		.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

describe('hosted MCP tool catalogs', () => {
	for (const [server, catalog] of Object.entries(SERVERS)) {
		describe(server, () => {
			it('exposes a non-empty tool catalog', () => {
				expect(Array.isArray(catalog)).toBe(true);
				expect(catalog.length).toBeGreaterThan(0);
			});

			it('every tool has a non-empty title', () => {
				for (const tool of catalog) {
					expect(
						typeof tool.title === 'string' && tool.title.trim().length > 0,
						`tool "${tool.name}" in ${server} is missing a title`,
					).toBe(true);
				}
			});

			it('every tool sets destructiveHint explicitly (MCP defaults it to true)', () => {
				for (const tool of catalog) {
					const a = tool.annotations;
					expect(a, `tool "${tool.name}" in ${server} has no annotations`).toBeTruthy();
					expect(
						typeof a.destructiveHint === 'boolean',
						`tool "${tool.name}" in ${server} must set annotations.destructiveHint explicitly`,
					).toBe(true);
				}
			});

			it('tool names are unique within the server', () => {
				const names = catalog.map((t) => t.name);
				expect(new Set(names).size).toBe(names.length);
			});

			it('matches the frozen public contract snapshot', () => {
				expect(catalogContract(catalog)).toMatchSnapshot();
			});
		});
	}
});
