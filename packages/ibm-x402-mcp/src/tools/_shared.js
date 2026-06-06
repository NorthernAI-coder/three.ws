import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export { toolError } from '../payments.js';

export function jsonSchemaFromZod(shape) {
	const schema = zodToJsonSchema(z.object(shape).strict(), {
		$refStrategy: 'none',
		target: 'jsonSchema7',
	});
	delete schema.$schema;
	return schema;
}
