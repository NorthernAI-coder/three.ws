#!/usr/bin/env node
// @three-ws/omniology-mcp — stdio MCP server for Omniology AI-agent contests.
//
// The contract artifact: it lets ANY MCP client/agent read and enter Omniology
// contests, and it makes Omniology auto-discoverable in the x402 Bazaar. Three
// free read tools wrap Omniology's live contest feed; submit_entry is x402-priced
// in USDC on Solana — this server is the x402 front door for Omniology.
//
//   • list_contests   (free)  — the running round + next open + recent winners
//   • get_contest     (free)  — one contest's detail + leaderboard + entries
//   • get_leaderboard (free)  — a contest's ranked leaderboard
//   • submit_entry    (paid)  — settle USDC, then forward the entry to Omniology
//
// Run standalone:
//   OMNIOLOGY_BASE_URL=https://api.omniology.ai MCP_SVM_PAYMENT_ADDRESS=<wallet> \
//     node packages/omniology-mcp/src/index.js
//
// Or wire into Claude Code / Cursor / any MCP host — see README.md.

import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { assertBaseUrl } from './config.js';
import { assertPaymentEnv, getResourceServer, getLastFacilitatorInitError } from './payments.js';
import { OmniologyClient } from './omniology.js';
import { buildListContestsTool } from './tools/list-contests.js';
import { buildGetContestTool } from './tools/get-contest.js';
import { buildGetLeaderboardTool } from './tools/get-leaderboard.js';
import { buildSubmitEntryTool } from './tools/submit-entry.js';

// Single source of truth for the advertised version — package.json.
const require = createRequire(import.meta.url);
const SERVER_VERSION = require('../package.json').version;

const SERVER_INSTRUCTIONS =
	'Omniology contests over MCP. Three FREE read tools wrap the live contest feed: ' +
	'list_contests (running round + next open + recent winners), get_contest (one contest detail + ' +
	'leaderboard + entries), get_leaderboard (ranked leaderboard) — no payment, key, or wallet needed. ' +
	'submit_entry is PAID: it settles USDC on Solana via x402, then forwards your entry to Omniology. ' +
	'A submit_entry call without an x402 payment payload in _meta returns a PaymentRequired envelope ' +
	'(v2 MCP transport spec); x402-capable clients sign and retry automatically. Read tools never charge.';

/**
 * Build and return a fully-registered McpServer without connecting a transport.
 * Safe to call from tests — registration touches no payment env and makes no
 * network call. An OmniologyClient may be injected; otherwise the default
 * (env-configured, global fetch) client is used.
 *
 * @param {OmniologyClient} [client]
 * @returns {Promise<McpServer>}
 */
export async function buildServer(client = new OmniologyClient()) {
	const server = new McpServer(
		{ name: 'omniology-mcp', title: 'Omniology Contests via x402', version: SERVER_VERSION },
		{
			capabilities: { tools: { listChanged: false } },
			instructions: SERVER_INSTRUCTIONS,
		},
	);

	const tools = await Promise.all([
		buildListContestsTool(client),
		buildGetContestTool(client),
		buildGetLeaderboardTool(client),
		buildSubmitEntryTool(client),
	]);

	for (const t of tools) {
		server.registerTool(
			t.name,
			{
				title: t.title,
				description: t.description,
				inputSchema: t.inputSchema,
				annotations: t.annotations,
			},
			t.handler,
		);
	}

	return server;
}

async function main() {
	// Fail fast and clearly on missing required env: the Omniology base URL
	// (everything needs it) and the Solana payment address (submit_entry needs
	// it to receive USDC). Each throws a single actionable line.
	try {
		assertBaseUrl();
		assertPaymentEnv();
	} catch (err) {
		console.error(`[omniology-mcp] configuration error: ${err.message}`);
		process.exit(1);
		return;
	}

	// Warm the shared x402 resource server so the first paid call doesn't pay the
	// facilitator /supported fetch cost.
	await getResourceServer();
	const initErr = getLastFacilitatorInitError();
	if (initErr) {
		console.error(`[omniology-mcp] facilitator init warning: ${initErr.message}`);
	}

	const server = await buildServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error(
		`[omniology-mcp@${SERVER_VERSION}] ready — 3 free + 1 paid tool registered over stdio`,
	);
}

// Connect stdio ONLY when this file is the process entry point. Launched through
// the npm bin (a symlink to this file), process.argv[1] is the symlink while
// import.meta.url is the resolved target, so compare both directly and via
// realpath — otherwise the server would never start under npx.
function isProcessEntryPoint() {
	const argvPath = process.argv[1];
	if (!argvPath) return false;
	if (import.meta.url === pathToFileURL(argvPath).href) return true;
	try {
		return import.meta.url === pathToFileURL(realpathSync(argvPath)).href;
	} catch {
		return false;
	}
}

if (isProcessEntryPoint()) {
	main().catch((err) => {
		console.error(`omniology-mcp: ${err?.message || err}`);
		process.exit(1);
	});
}
