// @ts-check
// Server-side Avaturn helpers shared by the onboarding photo flow and the
// avaturn-seed cron.
//
// The seed cron needs a *catalog* session — an editor session opened WITHOUT
// selfie photos, so the headless driver can pick a body + assets from the
// account's own catalog and export a fully-rigged GLB. That's a different shape
// from the photo→avatar onboarding session, hence its own helper here.

import { env } from './env.js';

const SESSION_PATH = '/api/v1/sessions';
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * @typedef {{ sessionUrl: string, expiresAt: string | null, raw: any }} AvaturnSession
 */

/**
 * Open an Avaturn editor session with no photos so the catalog (bodies + assets)
 * can be randomized in the editor. Attributed to `externalUserId` so Avaturn
 * tracks usage per synthetic account.
 *
 * @param {{ externalUserId: string, bodyType?: 'male'|'female', signal?: AbortSignal }} opts
 * @returns {Promise<AvaturnSession>}
 */
export async function createCatalogSession({ externalUserId, bodyType = 'male', signal }) {
	if (!env.AVATURN_API_KEY) {
		throw Object.assign(new Error('AVATURN_API_KEY unset'), { code: 'not_configured', status: 501 });
	}
	const url = `${env.AVATURN_API_URL}${SESSION_PATH}`;
	// session_type 'create' opens the editor's create UI on a default body; with
	// no photos the user (here, the headless driver) builds the avatar from the
	// catalog. export_type 'url' makes exportAvatar resolve to a fetchable GLB
	// URL rather than a multi-MB data URI.
	const body = {
		external_user_id: externalUserId,
		body_type: bodyType,
		session_type: 'create',
		export_type: 'url',
	};

	const upstream = await fetch(url, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.AVATURN_API_KEY}`,
			'content-type': 'application/json',
			accept: 'application/json',
		},
		body: JSON.stringify(body),
		signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!upstream.ok) {
		const text = await upstream.text().catch(() => '');
		throw Object.assign(new Error(`avaturn session ${upstream.status}: ${text.slice(0, 200)}`), {
			code: upstream.status === 401 ? 'upstream_auth' : 'upstream_error',
			status: upstream.status >= 500 ? 502 : upstream.status,
		});
	}

	const data = await upstream.json();
	const sessionUrl = data?.session_url || data?.url || data?.iframe_url;
	if (!sessionUrl) {
		throw Object.assign(new Error('avaturn response missing session_url'), {
			code: 'upstream_error',
			status: 502,
		});
	}
	return { sessionUrl, expiresAt: data?.expires_at ?? null, raw: data };
}
