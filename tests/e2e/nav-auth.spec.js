import { test, expect } from '@playwright/test';

// Drives a real Chromium against the homepage (pages/home.html, served at "/")
// to prove the auth-aware nav swap works end-to-end: the shared /nav-auth.js
// module reconciles the hand-rolled homepage nav against /api/auth/me. The auth
// endpoint is stubbed at the network layer so we exercise the real client wiring
// without standing up a session/DB — only the contract (`{ user }` vs
// `{ user: null }`) is faked, which is exactly the seam the client depends on.

const SIGN_IN = '.nav-end a[data-auth="out"]';
const MY_AGENTS = '.nav-end a[data-auth="in"]';
const CONSOLE_PILL = '.nav-end a[data-auth-name]';

function stubMe(page, body, status = 200) {
	return page.route('**/api/auth/me', (route) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify(body),
		}),
	);
}

test('signed-out visitor sees "Sign in", not the account entry points', async ({ page }) => {
	await stubMe(page, { user: null });
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	await expect(page.locator(SIGN_IN)).toBeVisible();
	await expect(page.locator(MY_AGENTS)).toBeHidden();
});

test('signed-in visitor sees account entry points and their name, not "Sign in"', async ({
	page,
}) => {
	await stubMe(page, { user: { display_name: 'Catherine Maerial', username: 'catherine' } });
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	await expect(page.locator(SIGN_IN)).toBeHidden();
	await expect(page.locator(MY_AGENTS)).toBeVisible();
	await expect(page.locator(CONSOLE_PILL)).toHaveText('Catherine Maerial');
});

test('falls back to the optimistic hint when the auth endpoint is down', async ({ page }) => {
	// Returning user: a prior sign-in left the local hint. The endpoint failing
	// must NOT flash them back to a signed-out nav.
	await page.addInitScript(() => {
		try {
			localStorage.setItem('3dagent:auth-hint', JSON.stringify({ authed: true, name: 'Catherine' }));
		} catch (_) {}
	});
	await page.route('**/api/auth/me', (route) => route.abort());
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	await expect(page.locator(SIGN_IN)).toBeHidden();
	await expect(page.locator(MY_AGENTS)).toBeVisible();
});

test('a stale hint is corrected when the server reports no session', async ({ page }) => {
	// Hint says signed-in, but the real session is gone (e.g. expired/revoked).
	// Server truth wins: the nav must reconcile back to "Sign in".
	await page.addInitScript(() => {
		try {
			localStorage.setItem('3dagent:auth-hint', JSON.stringify({ authed: true, name: 'Ghost' }));
		} catch (_) {}
	});
	await stubMe(page, { user: null });
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	await expect(page.locator(SIGN_IN)).toBeVisible();
	await expect(page.locator(MY_AGENTS)).toBeHidden();
});
