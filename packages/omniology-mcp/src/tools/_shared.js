import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export { toolError } from '../payments.js';

// MCP ToolAnnotations for the free read tools. Each reads Omniology's live
// contest feed: nothing local is modified (readOnlyHint) and it reaches an
// external service (openWorldHint). The feed advances every ~88s, so identical
// input can return different output — not idempotent.
export const readAnnotations = Object.freeze({
	readOnlyHint: true,
	openWorldHint: true,
	idempotentHint: false,
});

// MCP ToolAnnotations for submit_entry — a write to an external contest. It
// creates a new entry (not read-only), is not idempotent (each call is a fresh
// submission), and talks to a live service. Submitting is additive, not
// destructive, so destructiveHint stays false.
export const writeAnnotations = Object.freeze({
	readOnlyHint: false,
	openWorldHint: true,
	idempotentHint: false,
	destructiveHint: false,
});

export function jsonSchemaFromZod(shape) {
	const schema = zodToJsonSchema(z.object(shape).strict(), {
		$refStrategy: 'none',
		target: 'jsonSchema7',
	});
	delete schema.$schema;
	return schema;
}
