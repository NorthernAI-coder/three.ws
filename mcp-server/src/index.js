#!/usr/bin/env node
// @3d-agent/mcp-server entry point.
//
// Boots an MCP server over stdio that exposes paid tools for pose generation,
// pump.fun snapshots, ERC-8004 reputation lookups, and Solana vanity mining.
// Tool calls without payment return the v2 MCP-transport `PaymentRequired`
// envelope (per @x402/mcp + transports-v2/mcp.md). Successful settlements are
// reported back to the client under `_meta["x402/payment-response"]`.
//
// Run standalone:
//   node mcp-server/src/index.js
//
// Or wire into Claude Desktop / Cursor as documented in README.md.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { getLastFacilitatorInitError, getResourceServer } from './payments.js';
import { buildPoseSeedTool } from './tools/pose-seed.js';
import { buildPumpSnapshotTool } from './tools/pump-snapshot.js';
import { buildAgentReputationTool } from './tools/agent-reputation.js';
import { buildVanityGrinderTool } from './tools/vanity-grinder.js';

async function main() {
	// Force the shared x402 resource server to initialize before any tool is
	// registered — this fetches /supported from each facilitator so verify
	// + settle don't pay that cost on the first paid call.
	await getResourceServer();
	const initErr = getLastFacilitatorInitError();
	if (initErr) {
		console.error(`[mcp-server] facilitator init returned warnings: ${initErr.message}`);
	}

	const server = new McpServer({
		name: '3d-agent-mcp',
		version: '1.0.0',
	}, {
		capabilities: { tools: {} },
		instructions:
			'Paid x402 MCP tools from three.ws. Each tool quotes its USDC price in its description. ' +
			'Tool calls without an x402 payment payload in _meta return a PaymentRequired structuredContent ' +
			'(v2 MCP transport spec). Tools cover pose generation (get_pose_seed), Solana token snapshots ' +
			'(pump_snapshot), ERC-8004 agent reputation (agent_reputation), and Solana vanity address ' +
			'mining (vanity_grinder, upto-priced).',
	});

	const tools = await Promise.all([
		buildPoseSeedTool(),
		buildPumpSnapshotTool(),
		buildAgentReputationTool(),
		buildVanityGrinderTool(),
	]);

	for (const t of tools) {
		server.registerTool(
			t.name,
			{
				title: t.title,
				description: t.description,
				inputSchema: t.inputSchema,
			},
			t.handler,
		);
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);
	// Log to stderr so the stdout channel stays clean for MCP JSON-RPC frames.
	console.error(`[mcp-server] ready — ${tools.length} paid tools registered over stdio`);
}

main().catch((err) => {
	console.error(`[mcp-server] fatal: ${err.stack || err.message || err}`);
	process.exit(1);
});
