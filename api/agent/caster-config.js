// POST /api/agent/caster-config
//
// Generates a scoped API key for an agent and returns a ready-to-copy
// .env file + Docker run command for the agent-screen-caster service.
// The key is stored hashed — this is the only time the plaintext is returned.
//
// Body: { agentId: string }
// Auth: session cookie or bearer token

import { cors, json, method, readJson, wrap, error } from '../_lib/http.js';
import { getSessionUser, authenticateBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

// Mirrored from api/api-keys.js — same hashing, prefix, and storage.
import { randomBytes, createHash } from 'crypto';

const CASTER_SCOPE = 'agents:read agents:write';

function randomToken(len) {
	return randomBytes(len).toString('base64url').slice(0, len);
}

async function sha256(str) {
	return createHash('sha256').update(str).digest('hex');
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const auth = await getSessionUser(req).catch(() => null)
		|| await authenticateBearer(req).catch(() => null);
	if (!auth?.userId) return error(res, 401, 'unauthorized', 'sign in required');

	const body = await readJson(req, res);
	if (!body) return;
	const { agentId } = body;
	if (!agentId) return error(res, 400, 'validation_error', 'agentId required');

	// Confirm the caller owns this agent.
	const [agentRow] = await sql`
		SELECT id, name, display_name FROM agent_identities
		WHERE id = ${agentId} AND user_id = ${auth.userId} AND deleted_at IS NULL
	`;
	if (!agentRow) return error(res, 403, 'forbidden', 'not your agent');

	const agentName = agentRow.name || agentRow.display_name || agentId.slice(0, 8);

	// Create the API key.
	const rawToken  = `sk_live_${randomToken(32)}`;
	const prefix    = rawToken.slice(0, 14);
	const tokenHash = await sha256(rawToken);
	const keyName   = `Screen Caster — ${agentName}`;

	const [keyRow] = await sql`
		INSERT INTO api_keys (user_id, name, token_hash, prefix, scope)
		VALUES (${auth.userId}, ${keyName}, ${tokenHash}, ${prefix}, ${CASTER_SCOPE})
		RETURNING id, created_at
	`;

	const envBlock = [
		`# Screen Caster — ${agentName}`,
		`# Generated ${new Date().toISOString()}`,
		``,
		`AGENT_ID=${agentId}`,
		`AGENT_BEARER_TOKEN=${rawToken}`,
		`PUSH_URL=https://three.ws/api/agent/screen-push`,
		``,
		`# Task: pump-monitor | trade`,
		`TASK=pump-monitor`,
		`# Mint to watch (pump-monitor) or JSON trade spec (trade):`,
		`TASK_ARG=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`,
		``,
		`FRAME_INTERVAL_MS=400`,
		`JPEG_QUALITY=72`,
		`HEADLESS=true`,
	].join('\n');

	const dockerCmd = [
		`docker run --rm \\`,
		`  -e AGENT_ID=${agentId} \\`,
		`  -e AGENT_BEARER_TOKEN=${rawToken} \\`,
		`  -e PUSH_URL=https://three.ws/api/agent/screen-push \\`,
		`  -e TASK=pump-monitor \\`,
		`  -e TASK_ARG=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump \\`,
		`  three-ws/agent-screen-caster`,
	].join('\n');

	return json(res, 200, {
		keyId:     keyRow.id,
		prefix,
		agentId,
		agentName,
		scope:     CASTER_SCOPE,
		createdAt: keyRow.created_at,
		envBlock,
		dockerCmd,
	});
});
