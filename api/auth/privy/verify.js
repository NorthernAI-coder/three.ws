// Verify a Privy auth token and issue a three.ws session.
// POST /api/auth/privy/verify  { token: string }
//
// The token is a Privy identity JWT signed by Privy's private key.
// We verify it against Privy's published JWKS endpoint (no app secret needed).
// On success we find-or-create a user and issue the standard session cookie.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { sql } from '../../_lib/db.js';
import { createSession, sessionCookie, destroySession } from '../../_lib/auth.js';
import { cors, json, method, readJson, wrap, error } from '../../_lib/http.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { parse } from '../../_lib/validate.js';
import { seedDefaultAgent } from '../../_lib/seed-default-agent.js';
import { logAudit } from '../../_lib/audit.js';

const bodySchema = z.object({
	token: z.string().min(10),
});

// jose caches the JWKS in memory between calls on the same warm instance.
const jwksSets = new Map();
function getJwks(appId) {
	if (!jwksSets.has(appId)) {
		jwksSets.set(
			appId,
			createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`)),
		);
	}
	return jwksSets.get(appId);
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const ip = clientIp(req);
	const rl = await limits.authIp(ip);
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many attempts');

	const appId = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID;
	if (!appId) return error(res, 503, 'not_configured', 'Privy is not configured on this server');

	const { token } = parse(bodySchema, await readJson(req));

	// Verify the Privy identity token with Privy's JWKS.
	let payload;
	try {
		const JWKS = getJwks(appId);
		const result = await jwtVerify(token, JWKS, {
			issuer: 'privy.io',
			audience: appId,
		});
		payload = result.payload;
	} catch {
		return error(res, 401, 'invalid_token', 'Privy token verification failed');
	}

	const privyDid = payload.sub; // 'did:privy:xxxxxxxx'
	if (!privyDid) return error(res, 401, 'invalid_token', 'missing subject claim');

	// Extract the most useful identity info Privy bundles in the token.
	const linkedAccounts = Array.isArray(payload.linked_accounts) ? payload.linked_accounts : [];
	const emailAccount = linkedAccounts.find(
		(a) => a.type === 'email' || a.type === 'google_oauth' || a.type === 'twitter_oauth' || a.type === 'github_oauth',
	);
	const walletAccount = linkedAccounts.find((a) => a.type === 'wallet');

	const realEmail = emailAccount?.address || emailAccount?.email || null;
	// Stable synthetic email scoped to this Privy DID — same pattern as SIWE/SIWS.
	const syntheticEmail = `privy-${privyDid.replace('did:privy:', '')}@privy.local`;
	const effectiveEmail = realEmail || syntheticEmail;
	const displayName =
		emailAccount?.name ||
		(realEmail ? realEmail.split('@')[0] : null) ||
		privyDid.slice(-8);

	// Find or create user. Look up by synthetic email first (stable per Privy DID),
	// then fall through to real email (lets an existing email/password user link
	// their Privy account on next login without creating a duplicate).
	let userId;
	let isNew = false;

	const [byDid] = await sql`
		select id from users
		where email = ${syntheticEmail} and deleted_at is null
		limit 1
	`;

	if (byDid) {
		userId = byDid.id;
	} else if (realEmail) {
		const [byReal] = await sql`
			select id from users
			where email = ${realEmail} and deleted_at is null
			limit 1
		`;
		if (byReal) {
			userId = byReal.id;
		}
	}

	if (!userId) {
		// Create a new passwordless user. ON CONFLICT guards against a concurrent verify.
		const [created] = await sql`
			insert into users (email, display_name)
			values (${effectiveEmail}, ${displayName})
			on conflict (email) do update
				set deleted_at = null,
					display_name = excluded.display_name
			returning id, (xmax = 0) as inserted
		`;
		userId = created.id;
		isNew = created.inserted;
	}

	if (isNew) {
		queueMicrotask(() => seedDefaultAgent(userId));
	}

	// If Privy returned an embedded wallet, record it in user_wallets.
	if (walletAccount?.address) {
		const addr = walletAccount.address.toLowerCase();
		await sql`
			insert into user_wallets (user_id, address, chain_type, is_primary)
			values (${userId}, ${addr}, 'evm', true)
			on conflict (address) do update
				set last_used_at = now()
		`.catch(() => {});
	}

	await destroySession(req);
	const sessionToken = await createSession({
		userId,
		userAgent: req.headers['user-agent'],
		ip,
	});
	res.setHeader('set-cookie', sessionCookie(sessionToken));
	logAudit({ userId, action: 'login:privy', req });

	const [userRow] = await sql`
		select id, email, display_name, plan, avatar_url, created_at
		from users where id = ${userId} limit 1
	`;

	return json(res, 200, { user: userRow });
});
