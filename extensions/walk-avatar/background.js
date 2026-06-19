// background.js — service worker for the three.ws Walk Avatar extension.
//
// Responsibilities:
//   • Seed and serve default settings (chrome.storage.sync, roams across installs).
//   • Relay the popup/options UI to the per-tab content scripts.
//   • Capture the session token from the three.ws auth-callback tab.
//   • Inject content.js + content-narrator.js on demand and keep their iframes
//     in sync as settings change.
//   • Enforce the site allow/blocklist before an avatar is ever mounted.

const THREEWS_ORIGIN = 'https://three.ws';

// Defaults are written on install and used as the merge base everywhere the UI
// reads settings, so a missing key never produces `undefined` downstream.
const DEFAULTS = {
	avatarId: '',
	walkSpeed: 1.0,
	position: 'bottom-right',
	sizePreset: 'medium',
	width: 180,
	height: 260,
	siteAllowlist: [],
	siteBlocklist: [],
	narrationEnabled: false,
	voice: 'nova',
	theme: 'auto',
};

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
	const existing = await chrome.storage.sync.get(null);
	// Merge so an upgrade keeps the user's choices but backfills new keys.
	const merged = { ...DEFAULTS, ...existing };
	await chrome.storage.sync.set(merged);
	if (reason === 'install') {
		chrome.tabs.create({ url: `${THREEWS_ORIGIN}/extension` }).catch(() => {});
	}
});

// ── Host filter ─────────────────────────────────────────────────────────────
// A blocklisted host always wins. An empty allowlist means "every site"; a
// non-empty allowlist restricts the avatar to those hosts only. Entries match
// the host and any subdomain (`example.com` covers `www.example.com`).
function hostMatches(host, pattern) {
	const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	if (!p) return false;
	host = host.toLowerCase();
	return host === p || host.endsWith('.' + p);
}

function siteAllowed(url, settings) {
	let host;
	try {
		host = new URL(url).hostname;
	} catch {
		return false;
	}
	const block = settings.siteBlocklist || [];
	if (block.some((p) => hostMatches(host, p))) return false;
	const allow = settings.siteAllowlist || [];
	if (allow.length > 0 && !allow.some((p) => hostMatches(host, p))) return false;
	return true;
}

async function getSettings() {
	const sync = await chrome.storage.sync.get(null);
	return { ...DEFAULTS, ...sync };
}

// Inject both content modules (idempotent — re-injection is a no-op once the
// guard flag is set inside content.js).
async function injectContent(tabId) {
	await chrome.scripting.executeScript({
		target: { tabId },
		files: ['content-narrator.js', 'content.js'],
	});
}

// ── Message relay ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	(async () => {
		try {
			switch (msg.type) {
				case 'get-state': {
					const [local, settings] = await Promise.all([
						chrome.storage.local.get(['threews_session']),
						getSettings(),
					]);
					sendResponse({ session: local.threews_session || null, settings });
					break;
				}

				case 'set-avatar': {
					await chrome.storage.sync.set({ avatarId: msg.avatarId });
					broadcast({ type: 'walk:setAvatar', avatarId: msg.avatarId });
					sendResponse({ ok: true });
					break;
				}

				case 'toggle-tab': {
					const { tabId, enabled, avatarId } = msg;
					if (enabled) {
						const tab = await chrome.tabs.get(tabId);
						const settings = await getSettings();
						if (!siteAllowed(tab.url || '', settings)) {
							sendResponse({ ok: false, error: 'blocked', reason: 'site filtered' });
							break;
						}
						await injectContent(tabId);
						await chrome.tabs.sendMessage(tabId, {
							type: 'walk:mount',
							avatarId: avatarId || settings.avatarId,
						}).catch(() => {});
						sendResponse({ ok: true });
					} else {
						await chrome.tabs.sendMessage(tabId, { type: 'walk:unmount' }).catch(() => {});
						sendResponse({ ok: true });
					}
					break;
				}

				case 'store-session': {
					await chrome.storage.local.set({ threews_session: msg.token });
					sendResponse({ ok: true });
					break;
				}

				case 'clear-session': {
					await chrome.storage.local.remove('threews_session');
					sendResponse({ ok: true });
					break;
				}

				case 'update-settings': {
					await chrome.storage.sync.set(msg.settings);
					const settings = await getSettings();
					// Push the full settings object so every open iframe re-applies
					// speed, position, size, theme, and narration state at once.
					broadcast({ type: 'walk:applySettings', settings });
					sendResponse({ ok: true });
					break;
				}

				case 'check-site': {
					const settings = await getSettings();
					sendResponse({ allowed: siteAllowed(msg.url || '', settings) });
					break;
				}

				default:
					sendResponse({ ok: false, error: 'unknown_message' });
			}
		} catch (err) {
			sendResponse({ ok: false, error: String(err?.message || err) });
		}
	})();
	return true; // keep the channel open for the async response
});

// Send a message to every tab that has a mounted avatar. Tabs without the
// content script simply reject — swallowed here.
function broadcast(message) {
	chrome.tabs.query({}, (tabs) => {
		for (const tab of tabs) {
			if (tab.id == null) continue;
			chrome.tabs.sendMessage(tab.id, message).catch(() => {});
		}
	});
}

// ── Auth callback capture ─────────────────────────────────────────────────────
// The popup opens three.ws/login?redirect=extension. After a successful sign-in
// the site redirects to /extension/auth-callback?token=<session>. We read the
// token out of that tab's URL, persist it, close the tab, and notify any open
// popup so it can re-render the signed-in state.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status !== 'complete' || !tab.url) return;
	if (!tab.url.startsWith(THREEWS_ORIGIN + '/extension/auth-callback')) return;

	let token = null;
	try {
		const u = new URL(tab.url);
		token = u.searchParams.get('token') || u.hash.replace(/^#token=/, '') || null;
	} catch {
		token = null;
	}
	if (!token) return;

	chrome.storage.local.set({ threews_session: token }).then(() => {
		chrome.runtime.sendMessage({ type: 'session-updated', token }).catch(() => {});
		chrome.tabs.remove(tabId).catch(() => {});
	});
});
