/**
 * Single source of truth for an agent's custodial Solana wallet chip.
 *
 * Every surface where an agent or avatar is visible — profile, marketplace card,
 * directory row, avatar page, dashboards, trending, characters — renders the same
 * wallet chip from this module, so the wallet (and its vanity styling) looks and
 * behaves identically everywhere. There is no shared agent-card in this codebase
 * (each surface rolls its own markup), so the consistency lives here.
 *
 * A wallet is owned per (user, agent): the creator of an avatar/agent controls its
 * wallet, and a fork mints a brand-new wallet owned by the forker (see
 * api/avatars/fork.js). The chip never exposes secret material — only the public
 * address, its vanity prefix/suffix, a copy action, and an explorer link. For the
 * owner it also surfaces a "Make it vanity" entry point that routes to the wallet
 * hub where the grind + money-safe swap happens (POST /api/agents/:id/solana/vanity).
 *
 * Reads the address from any agent OR avatar record shape:
 *   agent.solana_address | agent.meta.solana_address | agent.wallet (base58)
 *   avatar.agent_solana_address  (the agent joined onto an avatar row)
 * and the vanity pattern from:
 *   agent.solana_vanity_prefix/suffix | agent.meta.solana_vanity_prefix/suffix
 *   avatar.agent_solana_vanity_prefix/suffix
 * so a surface can pass whichever record it already holds without reshaping it.
 */

import { computeRarity } from '../solana/vanity/rarity.js';

const STYLE_ID = 'tws-agent-wallet-chip-styles';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function esc(s) {
	return String(s == null ? '' : s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

/**
 * Normalize any agent record into a wallet descriptor, or null when there is no
 * custodial Solana wallet yet.
 * @returns {null | { address, prefix, suffix, isVanity, explorerUrl, hubUrl, agentId }}
 */
export function getWalletStatus(agent) {
	if (!agent || typeof agent !== 'object') return null;
	const meta = agent.meta || {};
	const address =
		agent.solana_address || meta.solana_address || agent.agent_solana_address ||
		(typeof agent.wallet === 'string' && BASE58_RE.test(agent.wallet) ? agent.wallet : null) ||
		null;
	if (!address || !BASE58_RE.test(String(address))) return null;

	const prefix =
		agent.solana_vanity_prefix || meta.solana_vanity_prefix || agent.agent_solana_vanity_prefix || null;
	const suffix =
		agent.solana_vanity_suffix || meta.solana_vanity_suffix || agent.agent_solana_vanity_suffix || null;
	// Prefer the linked-agent id on avatar rows (agent_id) so the hub deep-link
	// targets the agent that owns the wallet, not the avatar row id. Agent records
	// have no agent_id field, so this falls through to their own id.
	const agentId = agent.agent_id || agent.agentId || agent.id || null;

	const pre = prefix ? String(prefix) : null;
	const suf = suffix ? String(suffix) : null;
	const isVanity = !!(pre || suf);
	// Honest rarity tier from the SAME model the proof-of-grind gallery uses, so a
	// rare agent address advertises its tier everywhere the chip appears. Only an
	// actual vanity pattern that the address really satisfies earns a tier — a
	// claimed prefix that doesn't match the address is ignored.
	let rarity = null;
	if (isVanity) {
		const addr = String(address);
		const realPrefix = pre && addr.startsWith(pre) ? pre : '';
		const realSuffix = suf && addr.endsWith(suf) ? suf : '';
		if (realPrefix || realSuffix) {
			const r = computeRarity({ prefix: realPrefix, suffix: realSuffix });
			if (r.tier !== 'common') rarity = { tier: r.tier, label: r.tierLabel, accent: r.accent, score: r.rarityScore };
		}
	}

	return {
		address: String(address),
		prefix: pre,
		suffix: suf,
		isVanity,
		rarity,
		explorerUrl: `https://solscan.io/account/${address}`,
		hubUrl: agentId ? `/agent/${agentId}/wallet` : null,
		galleryUrl: `/vanity/gallery?address=${encodeURIComponent(String(address))}`,
		agentId,
	};
}

/** True when the agent has a custodial Solana wallet. */
export function hasWallet(agent) {
	return getWalletStatus(agent) != null;
}

/** Render the short, vanity-aware address label (prefix/suffix highlighted). */
function addressLabelHTML(status) {
	const { address, prefix, suffix } = status;
	const head = prefix && address.startsWith(prefix) ? prefix : address.slice(0, 4);
	const tail = suffix && address.endsWith(suffix) ? suffix : address.slice(-4);
	const headHi = !!(prefix && address.startsWith(prefix));
	const tailHi = !!(suffix && address.endsWith(suffix));
	return (
		`<span class="twc-addr">` +
		`<span class="${headHi ? 'twc-hi' : ''}">${esc(head)}</span>` +
		`<span class="twc-dots">…</span>` +
		`<span class="${tailHi ? 'twc-hi' : ''}">${esc(tail)}</span>` +
		`</span>`
	);
}

/** Inject the shared chip stylesheet once. Idempotent and SSR-safe. */
export function ensureWalletChipStyles() {
	if (typeof document === 'undefined') return;
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
.twc{display:inline-flex;align-items:center;gap:7px;padding:3px 9px;border-radius:999px;
	font:600 11px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
	color:#c4b5fd;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);
	white-space:nowrap;vertical-align:middle;max-width:100%;}
.twc[data-vanity="true"]{color:#a78bfa;background:rgba(139,92,246,.15);border-color:rgba(139,92,246,.5);}
.twc-ico{width:11px;height:11px;flex:none;opacity:.8;}
.twc-addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.01em;display:inline-flex;gap:1px;}
.twc-hi{color:#fff;font-weight:700;}
.twc-dots{opacity:.5;}
.twc-act{appearance:none;background:none;border:none;padding:0 2px;margin:0;cursor:pointer;color:inherit;
	opacity:.65;display:inline-flex;align-items:center;transition:opacity .15s ease,transform .12s ease;}
.twc-act:hover{opacity:1;}
.twc-act:active{transform:scale(.9);}
.twc-act:focus-visible{outline:2px solid rgba(139,92,246,.7);outline-offset:2px;border-radius:4px;}
.twc-act svg{width:12px;height:12px;}
a.twc-link{color:inherit;text-decoration:none;display:inline-flex;align-items:center;}
.twc-make{font-weight:600;font-size:10px;color:#a78bfa;text-decoration:none;border-left:1px solid rgba(139,92,246,.3);
	padding-left:7px;margin-left:1px;white-space:nowrap;transition:color .15s ease;}
.twc-make:hover{color:#fff;}
button.twc-make{appearance:none;background:none;border:none;border-left:1px solid rgba(139,92,246,.3);cursor:pointer;
	font-family:inherit;line-height:1;padding:0 0 0 7px;}
button.twc-make:active{transform:scale(.95);}
button.twc-make:focus-visible{outline:2px solid rgba(139,92,246,.7);outline-offset:2px;border-radius:4px;}
.twc-vanity-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.8;}
a.twc-rarity{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-decoration:none;
	padding:1px 6px;border-radius:999px;color:#06060b;line-height:1.4;white-space:nowrap;transition:transform .12s ease,filter .15s ease;}
a.twc-rarity:hover{transform:translateY(-1px);filter:brightness(1.08);}
a.twc-rarity:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:2px;}
.twc-pending{color:#888;background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);}
.twc-copied{color:#4ade80!important;}
@media (prefers-reduced-motion: reduce){.twc-act{transition:none;}}
`;
	(document.head || document.documentElement).appendChild(style);
}

const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const LINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const WALLET_SVG = '<svg class="twc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>';

/** Compact descriptor the tip modal needs, encoded onto the Tip button. */
function tipAttrs(agent, status) {
	const name = agent?.name || agent?.display_name || '';
	const avatar = agent?.avatar_thumbnail_url || agent?.avatar_url || agent?.profile_image_url || '';
	const accepted = (agent?.meta?.payments?.accepted_tokens || agent?.payments?.accepted_tokens || []).join(',');
	return (
		`data-twc-tip="${esc(status.address)}"` +
		(name ? ` data-twc-name="${esc(name)}"` : '') +
		(avatar ? ` data-twc-av="${esc(avatar)}"` : '') +
		(accepted ? ` data-twc-pay="${esc(accepted)}"` : '')
	);
}

/**
 * Render the wallet chip as an HTML string for template-string render sites
 * (card grids). Returns a "wallet pending" chip when no address is present yet so
 * the surface still communicates that every agent has a wallet.
 *
 * @param {object} agent  Any supported agent record shape.
 * @param {object} [opts]
 * @param {boolean} [opts.isOwner=false]  Owner sees the vanity entry point; a
 *   non-owner sees a Tip action instead. Ownership is the ONLY thing that gates
 *   which action shows — never withdraw/manage to a non-owner, never a vanity
 *   grind they can't assign (they must fork first; the fork CTA lives on the
 *   surface, and forking mints them their own wallet).
 * @param {boolean} [opts.showPending=true]  Render a pending chip when no wallet.
 * @param {boolean} [opts.link=true]  Make the address a copy/explorer affordance.
 * @param {boolean} [opts.tip=true]  Show the Tip action to non-owners.
 */
export function walletChipHTML(agent, opts = {}) {
	ensureWalletChipStyles();
	const { isOwner = false, showPending = true, link = true, tip = true } = opts;
	const status = getWalletStatus(agent);

	if (!status) {
		if (!showPending) return '';
		return `<span class="twc twc-pending" title="Wallet provisioning">${WALLET_SVG}<span>Wallet pending</span></span>`;
	}

	// A matched vanity address advertises its honest rarity tier (tinted); when the
	// chip is interactive it links to the address's appraisal in the proof-of-grind
	// gallery, otherwise (link:false, used inside card anchors) it stays a plain
	// span so we never nest an <a> in an <a>. An unmatched/plain-vanity pattern
	// falls back to the neutral "vanity" tag.
	const vanityTag = status.rarity
		? link
			? `<a class="twc-rarity" href="${esc(status.galleryUrl)}" style="background:${esc(status.rarity.accent)}" title="Rarity ${esc(status.rarity.label)} · score ${esc(status.rarity.score)} — appraise on three.ws" data-twc-stop>${esc(status.rarity.label)}</a>`
			: `<span class="twc-rarity" style="background:${esc(status.rarity.accent)}" title="Rarity ${esc(status.rarity.label)} · score ${esc(status.rarity.score)}">${esc(status.rarity.label)}</span>`
		: status.isVanity
			? '<span class="twc-vanity-tag">vanity</span>'
			: '';
	const copyBtn = link
		? `<button type="button" class="twc-act" data-twc-copy="${esc(status.address)}" title="Copy address" aria-label="Copy wallet address">${COPY_SVG}</button>`
		: '';
	const explorerLink = link
		? `<a class="twc-act twc-link" href="${esc(status.explorerUrl)}" target="_blank" rel="noopener noreferrer" title="View on Solscan" aria-label="View wallet on Solscan" data-twc-stop>${LINK_SVG}</a>`
		: '';
	// Owner → grind a vanity address (routes to the hub's money-safe swap).
	// Non-owner → tip the agent directly from their own wallet. A non-owner can
	// never grind/assign a vanity to an agent they don't own.
	const ownerAction =
		isOwner && !status.isVanity && status.hubUrl
			? `<a class="twc-make" href="${esc(status.hubUrl)}#vanity" title="Grind a custom vanity address" data-twc-stop>✦ Vanity</a>`
			: '';
	const tipBtn =
		!isOwner && tip
			? `<button type="button" class="twc-make twc-tip" ${tipAttrs(agent, status)} title="Tip ${esc(agent?.name || 'this agent')}" data-twc-stop>◎ Tip</button>`
			: '';

	const title = `Agent wallet ${status.address}${status.isVanity ? ' (vanity)' : ''}`;
	return (
		`<span class="twc" data-vanity="${status.isVanity}" title="${esc(title)}">` +
		WALLET_SVG +
		addressLabelHTML(status) +
		vanityTag +
		copyBtn +
		explorerLink +
		ownerAction +
		tipBtn +
		`</span>`
	);
}

/**
 * Render the wallet chip as a wired DOM node (copy button works, links don't
 * bubble to a parent card handler). Returns null only when there's no wallet and
 * showPending is false.
 */
export function walletChipEl(agent, opts = {}) {
	const html = walletChipHTML(agent, opts);
	if (!html) return null;
	const tpl = document.createElement('template');
	tpl.innerHTML = html.trim();
	const node = tpl.content.firstElementChild;
	if (node) wireWalletChip(node);
	return node;
}

/**
 * Wire copy buttons and stop-propagation links inside a container that holds one
 * or more chips rendered as HTML strings. Call this once after injecting card
 * markup that used walletChipHTML(). Idempotent per element.
 */
export function wireWalletChips(root) {
	if (!root || typeof root.querySelectorAll !== 'function') return;
	for (const el of root.querySelectorAll('[data-twc-copy],[data-twc-stop]')) {
		wireWalletChip(el.closest('.twc') || el);
	}
}

function wireWalletChip(node) {
	if (!node || node.__twcWired) return;
	node.__twcWired = true;
	for (const stop of node.querySelectorAll?.('[data-twc-stop]') || []) {
		stop.addEventListener('click', (e) => e.stopPropagation());
	}
	const tipBtn = node.querySelector?.('[data-twc-tip]');
	if (tipBtn) {
		tipBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const agent = {
				solana_address: tipBtn.getAttribute('data-twc-tip'),
				name: tipBtn.getAttribute('data-twc-name') || 'this agent',
				avatar_thumbnail_url: tipBtn.getAttribute('data-twc-av') || '',
				meta: { payments: { accepted_tokens: (tipBtn.getAttribute('data-twc-pay') || '').split(',').filter(Boolean) } },
			};
			try {
				const { openTipModal } = await import('./agent-tip-modal.js');
				openTipModal(agent);
			} catch {
				/* modal failed to load — the address is still copyable from the chip */
			}
		});
	}
	const btn = node.matches?.('[data-twc-copy]') ? node : node.querySelector?.('[data-twc-copy]');
	if (btn) {
		btn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const addr = btn.getAttribute('data-twc-copy');
			try {
				await navigator.clipboard.writeText(addr);
				const prev = btn.innerHTML;
				btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
				btn.classList.add('twc-copied');
				setTimeout(() => {
					btn.innerHTML = prev;
					btn.classList.remove('twc-copied');
				}, 1400);
			} catch {
				/* clipboard denied — no-op, the address is visible in the chip */
			}
		});
	}
}

if (typeof window !== 'undefined') {
	window.twsAgentWalletChip = {
		getWalletStatus, hasWallet, walletChipHTML, walletChipEl, wireWalletChips, ensureWalletChipStyles,
	};
}
