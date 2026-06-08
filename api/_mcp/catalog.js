import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { toolDefs as avatarDefs } from './tools/avatars.js';
import { toolDefs as modelDefs } from './tools/models.js';
import { toolDefs as solanaDefs } from './tools/solana.js';
import { toolDefs as pumpfunDefs } from './tools/pumpfun.js';
import { toolDefs as agentDefs } from './tools/agents.js';
import { toolDefs as animationDefs } from './tools/animations.js';
import { toolDefs as memoryDefs } from './tools/memory.js';
import { toolDefs as embedDefs } from './tools/embed.js';

const allDefs = [
	...avatarDefs,
	...embedDefs,
	...modelDefs,
	...animationDefs,
	...solanaDefs,
	...pumpfunDefs,
	...agentDefs,
	...memoryDefs,
];

// Schema objects for tools/list — strip internal fields (scope, handler).
export const TOOL_CATALOG = allDefs.map(({ scope: _s, handler: _h, ...schema }) => schema);

// Compile each tool's inputSchema once per process so dispatch can validate
// args before invoking the handler. The handlers currently trust their args
// and pass them to DB / external APIs; dispatch-level validation is
// defense-in-depth that fails fast on malformed input with a clear MCP
// JSON-RPC error instead of bubbling up a Postgres parse error or worse.
//
// `useDefaults: true` lets the per-tool `default` in JSON Schema (e.g.
// limit defaults) fill in for clients that omit optional fields, matching
// the existing handler behavior (`args.limit || 25`).
//
// `coerceTypes: true` accepts string forms of integers ("25") which some
// older MCP clients emit — same forgiveness the handlers currently rely on.
const ajv = new Ajv({
	allErrors: true,
	useDefaults: true,
	coerceTypes: true,
	strict: false,
});
addFormats(ajv);

// Handler lookup for tools/call — keyed by tool name.
export const TOOLS = Object.fromEntries(
	allDefs.map(({ name, scope, handler, inputSchema }) => [
		name,
		{
			scope,
			handler,
			validate: inputSchema ? ajv.compile(inputSchema) : null,
		},
	]),
);
