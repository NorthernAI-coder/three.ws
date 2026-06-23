/**
 * Proof-of-Custody — shared proof renderer.
 *
 * One renderer drives both the wallet-hub "Proof of Custody" tab and the
 * standalone /proof page, so the verification experience is identical wherever
 * an owner looks. It paints the inclusion proof, auto-runs the independent
 * in-browser verifier (passed in as `verify`), and reflects the outcome with an
 * honest green / red / pending state plus the per-step breakdown. It also renders
 * the movement reconciliation and, once verified, a shareable "verified custody"
 * badge + embed snippet.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function short(s, head = 8, tail = 8) {
	const v = String(s || '');
	return v.length > head + tail + 1 ? `${v.slice(0, head)}…${v.slice(-tail)}` : v;
}

function fmtTime(iso) {
	if (!iso) return '—';
	try {
		return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	} catch { return String(iso); }
}

/**
 * @param {HTMLElement} panel
 * @param {object} args
 * @param {object} args.proof   the `data` object from the inclusion-proof endpoint
 * @param {(proof:object)=>Promise<object>} args.verify  the independent verifier
 * @param {string} [args.shareBase='/proof']
 * @param {string} [args.origin]
 * @param {object} [args.ctx]   optional hub ctx (toast, copyToClipboard)
 */
export function renderProofUI(panel, { proof, verify, shareBase = '/proof', origin = '', ctx = {} }) {
	if (!proof || proof.included === false) {
		panel.innerHTML = notYetState(proof);
		panel.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
		return;
	}

	const anchor = proof.anchor || {};
	const recon = proof.reconciliation || {};
	const reconClass = recon.status === 'unexplained' ? 'is-bad' : recon.status === 'baseline' ? '' : 'is-good';

	panel.innerHTML = `
		<div class="awh-proof">
			<div class="awh-proof-hero is-pending" data-hero>
				<div class="awh-proof-seal" data-seal><span class="awh-proof-spin" aria-hidden="true"></span></div>
				<div class="awh-proof-hero-main">
					<div class="awh-proof-hero-title" data-hero-title>Verifying custody on-chain…</div>
					<div class="awh-proof-hero-sub" data-hero-sub>Recomputing your leaf and reading the anchor straight from a public Solana RPC — no trust in our server.</div>
				</div>
			</div>

			<div class="awh-proof-facts">
				${fact('Epoch', `#${esc(proof.epoch)}`)}
				${fact('Attested balance', `${formatSol(proof.leaf?.balanceSol)} SOL`)}
				${fact('Wallets in tree', esc(proof.wallet_count))}
				${fact('Snapshot', esc(fmtTime(proof.snapshot_at)))}
				${fact('Wallet', `<span title="${esc(proof.leaf?.address)}">${esc(short(proof.leaf?.address))}</span>`)}
				${fact('Ledger head', `<span title="${esc(proof.leaf?.ledgerHead)}">${esc(short(proof.leaf?.ledgerHead, 10, 6))}</span>`)}
				${fact('Merkle root', `<span title="${esc(proof.merkle_root)}">${esc(short(proof.merkle_root, 10, 10))}</span>`)}
				${fact('On-chain anchor', anchor.signature
					? `<a href="${esc(anchor.explorer)}" target="_blank" rel="noopener" title="${esc(anchor.signature)}">${esc(short(anchor.signature, 8, 8))} ↗</a>`
					: `<span style="color:var(--warn,#fbbf24)">${esc(anchor.status || 'pending')}</span>`)}
			</div>

			<div class="awh-proof-card">
				<h2>Verification steps</h2>
				<p class="awh-proof-lead">Each step runs in your browser. You are not trusting three.ws to tell you it's fine — you're checking it.</p>
				<ul class="awh-proof-steps" data-steps>${stepRow({ name: 'Independent verification', ok: null, detail: 'Running…' })}</ul>
			</div>

			<div class="awh-proof-recon ${reconClass}">
				<div class="awh-proof-recon-h">${recon.status === 'unexplained' ? '⚠ Unexplained movement' : 'Movement reconciliation'}</div>
				<div>${esc(recon.human || 'No reconciliation available.')}</div>
				${Array.isArray(recon.authorized_events) && recon.authorized_events.length
					? `<ul class="awh-proof-events">${recon.authorized_events.map(eventRow).join('')}</ul>`
					: ''}
			</div>

			<div data-share hidden></div>
		</div>
	`;

	runVerification();

	async function runVerification() {
		let result;
		try {
			result = await verify(proof);
		} catch (e) {
			result = { verified: false, steps: [{ name: 'Verifier error', ok: false, detail: e.message }], summary: 'Verifier crashed.' };
		}
		paintResult(result);
	}

	function paintResult(result) {
		const hero = panel.querySelector('[data-hero]');
		const seal = panel.querySelector('[data-seal]');
		const title = panel.querySelector('[data-hero-title]');
		const sub = panel.querySelector('[data-hero-sub]');
		const stepsEl = panel.querySelector('[data-steps]');
		if (!hero) return;

		const pendingAnchor = !anchor.signature;
		hero.classList.remove('is-pending');
		if (result.verified) {
			hero.classList.add('is-verified');
			seal.innerHTML = '✓';
			title.textContent = `Custody verified on-chain · epoch ${proof.epoch}`;
			sub.innerHTML = anchor.explorer
				? `Verified at ${esc(fmtTime(new Date().toISOString()))} against <a href="${esc(anchor.explorer)}" target="_blank" rel="noopener">the anchor transaction ↗</a>. Your wallet was included with the stated balance and ledger head.`
				: 'Verified against the on-chain anchor.';
		} else if (pendingAnchor) {
			hero.classList.add('is-pending');
			seal.innerHTML = '◷';
			title.textContent = 'Awaiting on-chain anchor';
			sub.textContent = 'Your inclusion proof is internally consistent, but this epoch has not been committed on-chain yet. Verification completes once the root is anchored (usually within a few hours).';
		} else {
			hero.classList.add('is-failed');
			seal.innerHTML = '✕';
			title.textContent = 'Custody NOT verified';
			sub.textContent = result.summary || 'Verification failed.';
		}

		stepsEl.innerHTML = (result.steps || []).map(stepRow).join('');

		if (result.verified) renderShare();
	}

	function renderShare() {
		const wrap = panel.querySelector('[data-share]');
		if (!wrap) return;
		const url = `${origin}${shareBase}?agent=${encodeURIComponent(proof.leaf.agentId)}`;
		const embed = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font:600 12px system-ui;color:#4ade80;text-decoration:none;padding:5px 11px;border:1px solid #4ade8055;border-radius:999px;background:#4ade801a">✓ Custody verified on-chain · three.ws</a>`;
		wrap.hidden = false;
		wrap.className = 'awh-proof-card';
		wrap.innerHTML = `
			<h2>Show it off</h2>
			<p class="awh-proof-lead">Your custody is provable — share it. Anyone can re-verify from the link, in their own browser.</p>
			<div class="awh-proof-actions">
				<span class="awh-proof-badge">Custody verified on-chain</span>
				<button class="awh-proof-btn ghost" type="button" data-copy-link>Copy verify link</button>
				<button class="awh-proof-btn ghost" type="button" data-copy-embed>Copy badge embed</button>
				<a class="awh-proof-btn ghost" href="${esc(shareBase)}?agent=${encodeURIComponent(proof.leaf.agentId)}" target="_blank" rel="noopener">Open verifier page ↗</a>
			</div>
			<div class="awh-proof-share">
				<textarea class="awh-proof-embed" readonly rows="2" aria-label="Badge embed HTML">${esc(embed)}</textarea>
			</div>
		`;
		wrap.querySelector('[data-copy-link]')?.addEventListener('click', () => copy(url, 'Verify link copied'));
		wrap.querySelector('[data-copy-embed]')?.addEventListener('click', () => copy(embed, 'Badge embed copied'));
	}

	async function copy(text, msg) {
		try {
			if (ctx.copyToClipboard) await ctx.copyToClipboard(text);
			else await navigator.clipboard.writeText(text);
			(ctx.toast || ((m) => {}))(msg);
		} catch { /* clipboard blocked — the textarea is selectable as a fallback */ }
	}
}

function fact(k, vHtml) {
	return `<div class="awh-proof-fact"><div class="awh-proof-fact-k">${esc(k)}</div><div class="awh-proof-fact-v">${vHtml}</div></div>`;
}

function stepRow(step) {
	const cls = step.ok === true ? 'ok' : step.ok === false ? 'bad' : 'pending';
	const ico = step.ok === true ? '✓' : step.ok === false ? '✕' : '…';
	return `<li class="awh-proof-step ${cls}">
		<span class="awh-proof-step-ico" aria-hidden="true">${ico}</span>
		<span class="awh-proof-step-c">
			<span class="awh-proof-step-name">${esc(humanStep(step.name))}</span>
			<span class="awh-proof-step-detail">${esc(step.detail || '')}</span>
		</span>
	</li>`;
}

function humanStep(name) {
	return ({
		leaf_recompute: 'Recompute leaf from public data',
		merkle_path: 'Walk the Merkle path to the root',
		onchain_anchor: 'Read the anchor straight from the chain',
		root_match: 'Match computed root to on-chain root',
		proof_present: 'Inclusion proof',
	})[name] || name;
}

function eventRow(e) {
	const sign = Number(e.amount_sol) ? `−${Math.abs(Number(e.amount_sol)).toFixed(6)}` : e.amount_sol;
	const link = e.explorer
		? `<a href="${esc(e.explorer)}" target="_blank" rel="noopener">${esc((e.event_type || '').toUpperCase())} ↗</a>`
		: esc((e.event_type || '').toUpperCase());
	return `<li class="awh-proof-event"><span>${link}${e.category ? ` · ${esc(e.category)}` : ''}${e.reason ? ` · ${esc(e.reason)}` : ''}</span><span>${esc(sign)} SOL</span></li>`;
}

function notYetState(proof) {
	const latest = proof && proof.latest_epoch != null ? proof.latest_epoch : null;
	return `<div class="awh-proof"><div class="awh-proof-card">
		<h2>Not attested yet</h2>
		<p class="awh-proof-lead">This wallet hasn't been included in a custody attestation epoch yet${latest != null ? ` (latest epoch is #${esc(latest)})` : ''}. New wallets are picked up on the next snapshot — check back shortly and you'll be able to verify your custody on-chain.</p>
		<button class="awh-proof-btn ghost" type="button" data-reload>Check again</button>
	</div></div>`;
}

function formatSol(n) {
	if (n == null || !Number.isFinite(Number(n))) return '—';
	const v = Number(n);
	return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}
