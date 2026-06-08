import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { buildGettingStartedTool } from '../_lib/mcp-getting-started.js';
import { toolDefs } from './tools.js';

// Free, public entry point — listed first so discovery clients see it up top.
const gettingStarted = buildGettingStartedTool({
	server: 'three.ws Agent',
	tagline: 'Give your assistant a real on-chain wallet to discover, pay for, and call x402 services in USDC.',
	tools: toolDefs,
	access: [
		'Sign in with your three.ws account (OAuth) to use your agent wallet.',
		'pay_and_call spends USDC from your own three.ws agent wallet within your spend caps — check wallet_status first.',
	],
	links: { homepage: 'https://three.ws', source: 'https://github.com/nirholas/three.ws' },
});

const allDefs = [gettingStarted, ...toolDefs];

// Schema objects for tools/list — strip internal fields (scope, handler).
export const TOOL_CATALOG = allDefs.map(({ scope: _s, handler: _h, ...schema }) => schema);

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: true, strict: false });
addFormats(ajv);

export const TOOLS = Object.fromEntries(
	allDefs.map(({ name, scope, handler, inputSchema }) => [
		name,
		{ scope, handler, validate: inputSchema ? ajv.compile(inputSchema) : null },
	]),
);
