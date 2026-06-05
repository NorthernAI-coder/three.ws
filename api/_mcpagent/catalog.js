import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { toolDefs } from './tools.js';

// Schema objects for tools/list — strip internal fields (scope, handler).
export const TOOL_CATALOG = toolDefs.map(({ scope: _s, handler: _h, ...schema }) => schema);

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: true, strict: false });
addFormats(ajv);

export const TOOLS = Object.fromEntries(
	toolDefs.map(({ name, scope, handler, inputSchema }) => [
		name,
		{ scope, handler, validate: inputSchema ? ajv.compile(inputSchema) : null },
	]),
);
