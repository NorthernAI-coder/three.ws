// GET /api/v1 — discovery document for the unified three.ws API.
//
// The single front door: one machine-readable index of every versioned
// endpoint, its auth requirement, scope, and parameters — so an agent or
// developer can discover the whole surface from one call. Rendered from the
// shared catalog (api/v1/_catalog.js) so it can never drift from the live routes.

import { defineEndpoint } from '../_lib/gateway.js';
import { API_META, CATALOG } from './_catalog.js';

export default defineEndpoint({
	name: 'v1.index',
	method: 'GET',
	auth: 'public',
	handler: () => ({
		...API_META,
		endpoints: CATALOG,
		docs: '/dashboard/developers',
		openapi: '/openapi.json',
	}),
});
