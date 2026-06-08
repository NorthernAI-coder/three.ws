import { test, expect } from '@playwright/test';

// Drives a real Chromium against every page whose hand-rolled header relies on
// the shared /nav-auth.js module to become auth-aware, proving the "Sign in" CTA
// swaps end-to-end. The auth endpoint is stubbed at the network layer so we
// exercise the real client wiring without a session/DB — only the contract
// (`{ user }` vs `{ user: null }`) is faked, which is exactly the seam the
// client depends on. Adding a page here guards it against the drift that left
// the homepage showing "Sign in" to signed-in users.

const PAGES = ['/', '/fact-checker'];

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

function presetHint(page, hint) {
	return page.addInitScript((value) => {
		try {
			localStorage.setItem('3dagent:auth-hint', JSON.stringify(value));
		} catch (_) {}
	}, hint);
}

for (const path of PAGES) {
	test.describe(`auth-aware nav · ${path}`, () => {
		test('signed-out visitor sees "Sign in", not the account entry points', async ({
			page,
		}) => {
			await stubMe(page, { user: null });
			await page.goto(path, { waitUntil: 'domcontentloaded' });

			await expect(page.locator(SIGN_IN)).toBeVisible();
			await expect(page.locator(MY_AGENTS)).toBeHidden();
		});

		test('signed-in visitor sees account entry points and their name', async ({ page }) => {
			await stubMe(page, {
				user: { display_name: 'Catherine Maerial', username: 'catherine' },
			});
			await page.goto(path, { waitUntil: 'domcontentloaded' });

			await expect(page.locator(SIGN_IN)).toBeHidden();
			await expect(page.locator(MY_AGENTS)).toBeVisible();
			await expect(page.locator(CONSOLE_PILL)).toHaveText('Catherine Maerial');
		});

		test('falls back to the optimistic hint when the auth endpoint is down', async ({
			page,
		}) => {
			// Returning user: a prior sign-in left the local hint. The endpoint
			// failing must NOT flash them back to a signed-out nav.
			await presetHint(page, { authed: true, name: 'Catherine' });
			await page.route('**/api/auth/me', (route) => route.abort());
			await page.goto(path, { waitUntil: 'domcontentloaded' });

			await expect(page.locator(SIGN_IN)).toBeHidden();
			await expect(page.locator(MY_AGENTS)).toBeVisible();
		});

		test('a stale hint is corrected when the server reports no session', async ({ page }) => {
			// Hint says signed-in, but the real session is gone (expired/revoked).
			// Server truth wins: the nav must reconcile back to "Sign in".
			await presetHint(page, { authed: true, name: 'Ghost' });
			await stubMe(page, { user: null });
			await page.goto(path, { waitUntil: 'domcontentloaded' });

			await expect(page.locator(SIGN_IN)).toBeVisible();
			await expect(page.locator(MY_AGENTS)).toBeHidden();
		});
	});
}
