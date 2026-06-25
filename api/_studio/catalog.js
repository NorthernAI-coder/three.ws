// Catalog + compiled validators for the FREE 3D Studio MCP (/api/mcp-studio).
//
// Exactly the five generation tools — no getting-started/discovery helper tool,
// no payment tool, nothing token- or wallet-shaped. The schema list (sent on
// tools/list) strips the handler; TOOLS binds each name to its handler and an
// Ajv-compiled validator for defense-in-depth arg checking (same pattern as
// api/_mcp3d/catalog.js).

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { studioTools } from './tools.js';

// Schema objects for tools/list — strip the handler, keep title + annotations.
export const TOOL_CATALOG = studioTools.map(({ handler: _h, ...schema }) => schema);

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: true, strict: false });
addFormats(ajv);

export const TOOLS = Object.fromEntries(
	studioTools.map(({ name, handler, inputSchema }) => [
		name,
		{ handler, validate: inputSchema ? ajv.compile(inputSchema) : null },
	]),
);
