// POST /api/developer/mcp-test — test MCP connectivity for the dashboard.
//
// Authenticates via session cookie, then dispatches tools/list through the MCP
// dispatch layer with a synthetic auth object matching the user. Returns the
// tools list (or an error envelope) without requiring the client to hold a
// plaintext API key (keys are hashed server-side and can't be retrieved).

import { getSessionUser } from '../_lib/auth.js';
import { cors, json, method, wrap, error } from '../_lib/http.js';
import { dispatch } from '../_mcp/dispatch.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const user = await getSessionUser(req);
	if (!user) return error(res, 401, 'unauthorized', 'sign in to test MCP');

	const auth = {
		userId: user.id,
		scope: 'avatars:read avatars:write avatars:delete profile agents:read agents:write',
		source: 'session',
	};

	const msg = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
	const result = await dispatch(msg, auth, req);

	return json(res, 200, result);
});
