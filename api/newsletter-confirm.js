// GET /api/newsletter-confirm?token=... — step 2 of double opt-in.
//
// The confirm link from the signup email lands here. A valid token flips the
// subscriber to `confirmed`, adds them to the Resend audience, and shows a
// branded confirmation page. Tokens are single-purpose; an already-confirmed or
// unknown token shows a neutral page rather than leaking which is which.

import { sql } from './_lib/db.js';
import { cors, method, wrap, text, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { addToAudience, resultPage } from './_lib/newsletter.js';

const APP_URL = process.env.APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN || 'https://three.ws';

function page(res, status, opts) {
	return text(res, status, resultPage(opts), { 'content-type': 'text/html; charset=utf-8' });
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.newsletterConfirmIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const token = (new URL(req.url, 'http://x').searchParams.get('token') || '').trim();
	if (!token || token.length > 128) {
		return page(res, 400, {
			heading: 'Invalid link',
			body: 'This confirmation link is malformed. Try subscribing again from the site.',
		});
	}

	const [sub] = await sql`
		select email, status, locale from newsletter_subscribers where confirm_token = ${token}
	`;

	if (!sub) {
		return page(res, 404, {
			heading: 'Link expired',
			body: 'This confirmation link is no longer valid. You can subscribe again any time.',
		});
	}

	if (sub.status === 'confirmed') {
		return page(res, 200, {
			heading: "You're already subscribed",
			body: "Your email is confirmed — you'll get three.ws updates as they ship.",
			ctaHref: `${APP_URL}/changelog`,
			ctaLabel: 'See the changelog',
		});
	}

	await sql`
		update newsletter_subscribers
		set status = 'confirmed', confirmed_at = now(), unsubbed_at = null
		where confirm_token = ${token}
	`;
	await addToAudience(sub.email, sub.locale);

	return page(res, 200, {
		heading: "You're in",
		body: "Subscription confirmed. You'll get new features, launches, and changelog highlights — nothing else.",
		ctaHref: `${APP_URL}/changelog`,
		ctaLabel: 'See the changelog',
	});
});
