/**
 * Agent Wallet hub — Proof of Custody tab (owner-only).
 *
 * Radical, verifiable transparency: the platform periodically anchors a Merkle
 * root over every custodial wallet's state on-chain. This tab shows the owner
 * their inclusion proof and lets them VERIFY it themselves — the verification
 * runs entirely in their browser (src/proof-of-custody/verifier.js): it
 * recomputes the leaf, walks the Merkle path, fetches the anchor straight off a
 * public Solana RPC, and confirms the on-chain root matches. It never trusts our
 * server for the answer, and it fails honestly (red, with the failing step) when
 * anything doesn't reconcile.
 *
 * Movement transparency is first-class: the reconciliation maps every balance
 * change since the previous epoch to an authorized, logged custody event, and
 * loudly flags any outflow the ledger can't explain.
 */

import { registerWalletTab } from '../registry.js';
import { apiFetch } from '../../api.js';
import { verifyInclusionProof } from '../../proof-of-custody/verifier.js';
import { renderProofUI } from '../../proof-of-custody/ui.js';

const STYLE_ID = 'awh-proof-style';

registerWalletTab({
	id: 'proof',
	label: 'Proof of Custody',
	order: 70,
	ownerOnly: true,
	mount({ panel, ctx }) {
		injectStyle();
		let destroyed = false;

		async function load() {
			panel.innerHTML = skeleton();
			let proof;
			try {
				const res = await apiFetch(`/api/agents/${encodeURIComponent(ctx.agentId)}/solana/proof`, {
					allowAnonymous: true,
				});
				if (res.status === 401) { panel.innerHTML = signedOut(); return; }
				if (!res.ok) throw new Error(`proof request failed (${res.status})`);
				proof = (await res.json())?.data;
			} catch (err) {
				if (destroyed) return;
				panel.innerHTML = errorState(err.message);
				panel.querySelector('[data-retry]')?.addEventListener('click', load);
				return;
			}
			if (destroyed) return;
			renderProofUI(panel, {
				proof,
				ctx,
				verify: verifyInclusionProof,
				shareBase: '/proof',
				origin: location.origin,
			});
		}

		load();
		return { destroy() { destroyed = true; } };
	},
});

function skeleton() {
	return `<div class="awh-proof awh-proof-skel" aria-busy="true">
		<span style="height:64px"></span>
		<span style="height:120px"></span>
		<span style="height:90px"></span>
	</div>`;
}

function signedOut() {
	return `<div class="awh-proof"><div class="awh-proof-card">
		<h2>Sign in to view your proof</h2>
		<p class="awh-proof-lead">Custody proofs are private to the wallet owner. Sign in to verify this wallet's custody on-chain.</p>
		<a class="awh-proof-btn" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a>
	</div></div>`;
}

function errorState(msg) {
	return `<div class="awh-proof"><div class="awh-proof-card awh-proof-bad">
		<h2>Couldn't load your proof</h2>
		<p class="awh-proof-lead">${escapeHtml(msg)}</p>
		<button class="awh-proof-btn" data-retry type="button">Try again</button>
	</div></div>`;
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function injectStyle() {
	if (document.getElementById(STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = STYLE_ID;
	tag.textContent = PROOF_STYLE;
	document.head.appendChild(tag);
}

// Shared styling for the proof UI, used by both the hub tab and the standalone
// /proof page (which imports renderProofUI from ../proof-of-custody/ui.js).
export const PROOF_STYLE = `
.awh-proof { display: flex; flex-direction: column; gap: var(--space-4,16px); }
.awh-proof-card { border: 1px solid var(--stroke, rgba(255,255,255,.08)); border-radius: var(--radius-lg,14px); background: var(--surface-1, rgba(255,255,255,.03)); padding: var(--space-4,16px); }
.awh-proof-card h2 { margin: 0 0 6px; font-size: var(--text-md,.9rem); color: var(--ink-bright,#fff); font-family: var(--font-display, system-ui); font-weight: 600; }
.awh-proof-lead { color: var(--ink-dim,#888); font-size: var(--text-sm,.8125rem); line-height: 1.55; margin: 0 0 4px; max-width: 64ch; }
.awh-proof-hero { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; border-radius: var(--radius-lg,14px); padding: var(--space-4,16px); border: 1px solid var(--stroke, rgba(255,255,255,.08)); background: var(--surface-1, rgba(255,255,255,.03)); transition: border-color var(--duration-base,220ms), background var(--duration-base,220ms); }
.awh-proof-hero.is-verified { border-color: color-mix(in srgb, var(--success,#4ade80) 50%, transparent); background: color-mix(in srgb, var(--success,#4ade80) 8%, transparent); }
.awh-proof-hero.is-failed { border-color: color-mix(in srgb, var(--danger,#f87171) 55%, transparent); background: color-mix(in srgb, var(--danger,#f87171) 8%, transparent); }
.awh-proof-hero.is-pending { border-color: color-mix(in srgb, var(--warn,#fbbf24) 50%, transparent); background: color-mix(in srgb, var(--warn,#fbbf24) 7%, transparent); }
.awh-proof-seal { width: 46px; height: 46px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 22px; background: var(--surface-3, rgba(255,255,255,.08)); }
.awh-proof-hero.is-verified .awh-proof-seal { background: color-mix(in srgb, var(--success,#4ade80) 18%, transparent); color: var(--success,#4ade80); }
.awh-proof-hero.is-failed .awh-proof-seal { background: color-mix(in srgb, var(--danger,#f87171) 18%, transparent); color: var(--danger,#f87171); }
.awh-proof-hero.is-pending .awh-proof-seal { background: color-mix(in srgb, var(--warn,#fbbf24) 18%, transparent); color: var(--warn,#fbbf24); }
.awh-proof-hero-main { min-width: 0; flex: 1; }
.awh-proof-hero-title { font-size: var(--text-lg,1.15rem); font-weight: 700; color: var(--ink-bright,#fff); font-family: var(--font-display, system-ui); line-height: 1.15; }
.awh-proof-hero-sub { font-size: var(--text-sm,.8125rem); color: var(--ink-dim,#888); margin-top: 3px; }
.awh-proof-hero-sub a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.awh-proof-spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--warn,#fbbf24) 30%, transparent); border-top-color: var(--warn,#fbbf24); animation: awh-proof-spin 0.7s linear infinite; }
@keyframes awh-proof-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .awh-proof-spin { animation: none; } }

.awh-proof-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3,12px); }
.awh-proof-fact { background: var(--surface-1, rgba(255,255,255,.03)); border: 1px solid var(--stroke, rgba(255,255,255,.08)); border-radius: var(--radius-md,10px); padding: 11px 13px; }
.awh-proof-fact-k { font-size: var(--text-2xs,.6875rem); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-dim,#888); }
.awh-proof-fact-v { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--text-sm,.8125rem); color: var(--ink-bright,#fff); margin-top: 4px; word-break: break-all; }
.awh-proof-fact-v a { color: inherit; }

.awh-proof-steps { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.awh-proof-step { display: flex; gap: 10px; align-items: flex-start; font-size: var(--text-sm,.8125rem); padding: 10px 12px; border-radius: var(--radius-md,10px); border: 1px solid var(--stroke, rgba(255,255,255,.08)); background: var(--surface-1, rgba(255,255,255,.03)); }
.awh-proof-step-ico { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.awh-proof-step.ok { border-color: color-mix(in srgb, var(--success,#4ade80) 35%, transparent); }
.awh-proof-step.ok .awh-proof-step-ico { background: color-mix(in srgb, var(--success,#4ade80) 18%, transparent); color: var(--success,#4ade80); }
.awh-proof-step.bad { border-color: color-mix(in srgb, var(--danger,#f87171) 40%, transparent); }
.awh-proof-step.bad .awh-proof-step-ico { background: color-mix(in srgb, var(--danger,#f87171) 18%, transparent); color: var(--danger,#f87171); }
.awh-proof-step.pending .awh-proof-step-ico { background: var(--surface-3, rgba(255,255,255,.08)); color: var(--ink-dim,#888); }
.awh-proof-step-c { min-width: 0; }
.awh-proof-step-name { color: var(--ink-bright,#fff); font-weight: 600; }
.awh-proof-step-detail { color: var(--ink-dim,#888); margin-top: 2px; line-height: 1.5; }

.awh-proof-recon { border-radius: var(--radius-md,10px); padding: 12px 14px; border: 1px solid var(--stroke, rgba(255,255,255,.08)); background: var(--surface-1, rgba(255,255,255,.03)); font-size: var(--text-sm,.8125rem); line-height: 1.55; color: var(--ink,#e8e8e8); }
.awh-proof-recon.is-good { border-color: color-mix(in srgb, var(--success,#4ade80) 35%, transparent); }
.awh-proof-recon.is-bad { border-color: color-mix(in srgb, var(--danger,#f87171) 50%, transparent); background: color-mix(in srgb, var(--danger,#f87171) 7%, transparent); color: var(--danger,#f87171); }
.awh-proof-recon-h { font-weight: 600; color: var(--ink-bright,#fff); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.awh-proof-recon.is-bad .awh-proof-recon-h { color: var(--danger,#f87171); }
.awh-proof-events { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.awh-proof-event { display: flex; justify-content: space-between; gap: 12px; font-size: var(--text-2xs,.72rem); font-family: var(--font-mono, ui-monospace, monospace); color: var(--ink-dim,#888); padding: 6px 9px; border-radius: var(--radius-sm,6px); background: var(--surface-2, rgba(255,255,255,.04)); }
.awh-proof-event a { color: var(--ink,#c8c8c8); }

.awh-proof-btn { appearance: none; font: inherit; font-size: var(--text-sm,.8125rem); font-weight: 600; cursor: pointer; color: var(--bg-1,#0a0a0a); background: var(--accent,#fff); border: 1px solid var(--accent,#fff); border-radius: var(--radius-md,10px); padding: 9px 16px; text-decoration: none; display: inline-flex; align-items: center; gap: 7px; transition: opacity var(--duration-fast,140ms), transform var(--duration-fast,140ms); }
.awh-proof-btn:hover { opacity: .9; }
.awh-proof-btn:active { transform: translateY(1px); }
.awh-proof-btn:focus-visible { outline: var(--focus-ring-width,2px) solid var(--focus-ring-color,#fff); outline-offset: 2px; }
.awh-proof-btn.ghost { color: var(--ink,#e8e8e8); background: transparent; border-color: var(--stroke, rgba(255,255,255,.12)); }
.awh-proof-btn:disabled { opacity: .5; cursor: progress; }
.awh-proof-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.awh-proof-share { margin-top: 12px; }
.awh-proof-embed { width: 100%; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--text-2xs,.7rem); color: var(--ink-dim,#888); background: var(--surface-2, rgba(255,255,255,.04)); border: 1px solid var(--stroke, rgba(255,255,255,.08)); border-radius: var(--radius-md,10px); padding: 9px 11px; resize: vertical; min-height: 54px; }
.awh-proof-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: var(--radius-pill,999px); font-size: var(--text-2xs,.72rem); font-weight: 600; border: 1px solid color-mix(in srgb, var(--success,#4ade80) 40%, transparent); color: var(--success,#4ade80); background: color-mix(in srgb, var(--success,#4ade80) 10%, transparent); }
.awh-proof-badge::before { content: '✓'; }

.awh-proof-skel span { display: block; background: var(--surface-2, rgba(255,255,255,.05)); border-radius: var(--radius-md,10px); animation: awh-skel 1.4s ease-in-out infinite; }
@keyframes awh-skel { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .awh-proof-skel span { animation: none; } }
`;
