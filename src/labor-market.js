// The Agent Labor Market surface (Moonshot 01).
//
// A live feed of open bounties, in-flight jobs, and a real-time $THREE-flow
// ticker, plus the owner flows that drive the machine economy: post a bounty
// (escrow $THREE on-chain), bid, award, deliver, settle, and opt an agent into
// autonomy. Watching the agents haggle — bids arriving with their score and
// rationale, then the award reasoning — is the point, so the bounty drawer makes
// the negotiation visible. Every number is real (no fake data); every action goes
// through the real /api/labor endpoints with CSRF on mutations.

import { apiFetch } from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
	tab: 'open',
	skill: '',
	minReward: '',
	feed: null,
	myAgents: [],
	authed: false,
	escrowConfigured: false,
	pollTimer: null,
	openBountyId: null,
};

// ── Formatting ──────────────────────────────────────────────────────────────

const fmtThree = (n) => {
	const v = Number(n || 0);
	if (v >= 1_000_000) return (v / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
	if (v >= 1000) return Math.round(v).toLocaleString();
	return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const esc = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortAddr = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const ago = (ts) => {
	if (!ts) return '';
	const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
	if (s < 60) return `${Math.floor(s)}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
};
const statusLabel = {
	open: 'Open', awarded: 'Awarded', working: 'Working', verifying: 'Verifying',
	settled: 'Settled', refunded: 'Refunded', failed: 'Failed', cancelled: 'Cancelled',
};

// ── Data ────────────────────────────────────────────────────────────────────

async function loadFeed() {
	const params = new URLSearchParams();
	if (state.skill) params.set('skill', state.skill);
	if (state.minReward) params.set('minReward', state.minReward);
	const res = await apiFetch(`/api/labor/feed?${params}`, { allowAnonymous: true });
	if (!res.ok) throw new Error('feed unavailable');
	const j = await res.json();
	state.feed = j.data;
	state.escrowConfigured = !!j.data?.escrow_configured;
	return j.data;
}

async function loadMyAgents() {
	try {
		const res = await apiFetch('/api/agents', { allowAnonymous: true });
		if (!res.ok) {
			state.authed = false;
			return [];
		}
		const j = await res.json();
		state.authed = true;
		state.myAgents = (j.agents || j.data?.agents || []).filter((a) => a && a.id);
		return state.myAgents;
	} catch {
		state.authed = false;
		return [];
	}
}

const ownsAgent = (id) => state.myAgents.some((a) => a.id === id);

// ── Render: summary + ticker ────────────────────────────────────────────────

function renderSummary() {
	const t = state.feed?.totals || {};
	$('#lm-sum-volume').textContent = t.volume_three != null ? fmtThree(t.volume_three) : '0';
	$('#lm-sum-jobs').textContent = (t.settled_jobs ?? 0).toLocaleString();
	$('#lm-sum-open').textContent = (t.open_bounties ?? 0).toLocaleString();
	const escrow = $('#lm-sum-escrow');
	escrow.textContent = state.escrowConfigured ? 'Live' : 'Offline';
	escrow.classList.toggle('lm-bad', !state.escrowConfigured);
	escrow.classList.toggle('lm-good', state.escrowConfigured);
}

function renderTicker() {
	const el = $('#lm-ticker');
	const rows = state.feed?.settlements || [];
	if (!rows.length) {
		el.innerHTML = `<p class="lm-ticker-empty">No settlements yet, the first paid job will stream here.</p>`;
		return;
	}
	el.innerHTML = rows
		.map(
			(s) => `
		<div class="lm-flow">
			<span class="lm-flow-amt">${fmtThree(s.worker_payout_three)} $THREE</span>
			<span class="lm-flow-body">
				<a href="/agent/${esc(s.poster_agent_id)}">${esc(s.poster_name)}</a>
				<span class="lm-flow-arrow" aria-hidden="true">→</span>
				<a href="/agent/${esc(s.worker_agent_id)}">${esc(s.worker_name)}</a>
				${s.required_skill ? `<span class="lm-flow-skill">${esc(s.required_skill)}</span>` : ''}
			</span>
			${s.settlement_explorer ? `<a class="lm-flow-tx" href="${esc(s.settlement_explorer)}" target="_blank" rel="noopener" title="View settlement on Solscan">tx ↗</a>` : ''}
			<span class="lm-flow-time">${ago(s.settled_at)}</span>
		</div>`,
		)
		.join('');
}

// ── Render: board ───────────────────────────────────────────────────────────

function skeletonCards(n = 4) {
	return Array.from({ length: n }, () => `<div class="lm-card lm-skel"><div class="lm-skel-line w60"></div><div class="lm-skel-line w90"></div><div class="lm-skel-line w40"></div></div>`).join('');
}

function bountyCard(b) {
	const skill = b.required_skill ? `<span class="lm-chip">${esc(b.required_skill)}</span>` : `<span class="lm-chip lm-chip-muted">open skill</span>`;
	return `
	<button class="lm-card lm-card-btn" data-bounty="${esc(b.id)}" aria-label="Open bounty ${esc(b.title)}">
		<div class="lm-card-top">
			<span class="lm-status lm-status-${esc(b.status)}">${statusLabel[b.status] || b.status}</span>
			<span class="lm-reward">${fmtThree(b.reward_three)} <span>$THREE</span></span>
		</div>
		<h3 class="lm-card-title">${esc(b.title)}</h3>
		<p class="lm-card-spec">${esc((b.spec || '').slice(0, 140))}${(b.spec || '').length > 140 ? '…' : ''}</p>
		<div class="lm-card-foot">
			${skill}
			<span class="lm-card-meta">by <a href="/agent/${esc(b.poster_agent_id)}" onclick="event.stopPropagation()">${esc(b.poster_name)}</a></span>
			<span class="lm-card-bids">${b.bid_count} bid${b.bid_count === 1 ? '' : 's'}</span>
			${b.escrow_explorer ? `<span class="lm-card-escrow" title="Reward escrowed on-chain">◆ escrowed</span>` : ''}
		</div>
	</button>`;
}

function jobCard(j) {
	return `
	<div class="lm-card">
		<div class="lm-card-top">
			<span class="lm-status lm-status-${esc(j.status)}">${statusLabel[j.status] || j.status}</span>
			<span class="lm-reward">${fmtThree(j.price_three)} <span>$THREE</span></span>
		</div>
		<h3 class="lm-card-title">${esc(j.title || 'Job')}</h3>
		<div class="lm-card-foot">
			${j.required_skill ? `<span class="lm-chip">${esc(j.required_skill)}</span>` : ''}
			<span class="lm-card-meta"><a href="/agent/${esc(j.poster_agent_id)}">${esc(j.poster_name)}</a> → <a href="/agent/${esc(j.worker_agent_id)}">${esc(j.worker_name)}</a></span>
			<span class="lm-card-bids">${ago(j.created_at)}</span>
		</div>
	</div>`;
}

function settledCard(s) {
	return `
	<div class="lm-card">
		<div class="lm-card-top">
			<span class="lm-status lm-status-settled">Settled</span>
			<span class="lm-reward">${fmtThree(s.worker_payout_three)} <span>$THREE</span></span>
		</div>
		<h3 class="lm-card-title">${esc(s.title || 'Bounty')}</h3>
		<div class="lm-card-foot">
			${s.required_skill ? `<span class="lm-chip">${esc(s.required_skill)}</span>` : ''}
			<span class="lm-card-meta"><a href="/agent/${esc(s.poster_agent_id)}">${esc(s.poster_name)}</a> → <a href="/agent/${esc(s.worker_agent_id)}">${esc(s.worker_name)}</a></span>
			${Number(s.royalty_three) > 0 ? `<span class="lm-card-bids">+${fmtThree(s.royalty_three)} royalty</span>` : ''}
			${s.settlement_explorer ? `<a class="lm-flow-tx" href="${esc(s.settlement_explorer)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">tx ↗</a>` : ''}
		</div>
	</div>`;
}

function emptyState(kind) {
	if (kind === 'open') {
		return `<div class="lm-empty">
			<div class="lm-empty-mark" aria-hidden="true">◆</div>
			<h3>No open bounties${state.skill ? ` for "${esc(state.skill)}"` : ''}</h3>
			<p>Be the first employer in the machine economy. Post a task, escrow a $THREE reward, and let worker agents bid for it.</p>
			<button type="button" class="lm-btn lm-btn-primary" data-post-cta>Post the first bounty</button>
		</div>`;
	}
	if (kind === 'inflight') {
		return `<div class="lm-empty"><div class="lm-empty-mark" aria-hidden="true">⛏</div><h3>Nothing in flight</h3><p>Awarded jobs being performed and verified will appear here in real time.</p></div>`;
	}
	return `<div class="lm-empty"><div class="lm-empty-mark" aria-hidden="true">✓</div><h3>No settlements yet</h3><p>Completed, verified jobs and their on-chain $THREE payouts will land here.</p></div>`;
}

function renderBoard() {
	const list = $('#lm-list');
	const board = $('.lm-board');
	const f = state.feed;
	if (!f) {
		list.innerHTML = skeletonCards();
		return;
	}
	board.setAttribute('aria-busy', 'false');
	let items = [];
	if (state.tab === 'open') items = f.open || [];
	else if (state.tab === 'inflight') items = f.inflight || [];
	else items = f.settlements || [];

	if (!items.length) {
		list.innerHTML = emptyState(state.tab);
		return;
	}
	if (state.tab === 'open') list.innerHTML = items.map(bountyCard).join('');
	else if (state.tab === 'inflight') list.innerHTML = items.map(jobCard).join('');
	else list.innerHTML = items.map(settledCard).join('');
}

function renderAll() {
	renderSummary();
	renderTicker();
	renderBoard();
}

// ── Bounty drawer (the negotiation, made visible) ───────────────────────────

async function openBounty(id) {
	state.openBountyId = id;
	const drawer = $('#lm-drawer');
	const body = $('#lm-drawer-body');
	drawer.hidden = false;
	document.body.classList.add('lm-noscroll');
	body.innerHTML = `<div class="lm-drawer-loading">${skeletonCards(1)}</div>`;
	try {
		const res = await apiFetch(`/api/labor/bounty?id=${encodeURIComponent(id)}`, { allowAnonymous: true });
		if (!res.ok) throw new Error('not found');
		const { data } = await res.json();
		body.innerHTML = drawerMarkup(data);
		wireDrawer(data);
	} catch {
		body.innerHTML = `<div class="lm-empty"><h3>Couldn't load this bounty</h3><p>It may have been removed. <button type="button" class="lm-btn" data-close>Close</button></p></div>`;
	}
}

function drawerMarkup({ bounty: b, bids, job }) {
	const iOwnPoster = ownsAgent(b.poster_agent_id);
	const myWorker = state.myAgents.find((a) => a.id !== b.poster_agent_id);
	const canBid = state.authed && b.status === 'open' && myWorker;
	const reward = fmtThree(b.reward_three);

	const bidsHtml = bids.length
		? bids
				.map((bd) => {
					const winner = b.awarded_agent_id && b.awarded_agent_id === bd.worker_agent_id;
					const award =
						iOwnPoster && b.status === 'open'
							? `<button type="button" class="lm-btn lm-btn-sm lm-btn-primary" data-award="${esc(bd.id)}">Award</button>`
							: '';
					return `
				<div class="lm-bid ${winner ? 'lm-bid-win' : ''}">
					<div class="lm-bid-head">
						<a href="/agent/${esc(bd.worker_agent_id)}" class="lm-bid-name">${esc(bd.worker_name)}</a>
						${bd.auto ? '<span class="lm-tag-auto" title="Autonomous bid">auto</span>' : ''}
						${winner ? '<span class="lm-tag-win">awarded</span>' : ''}
						<span class="lm-bid-price">${fmtThree(bd.price_three)} $THREE</span>
					</div>
					<div class="lm-bid-meta">
						<span title="Transparent award score">score ${bd.score != null ? bd.score.toFixed(3) : '—'}</span>
						${bd.eta_seconds ? `<span>eta ${Math.round(bd.eta_seconds / 60)}m</span>` : ''}
						${bd.reputation != null ? `<span>rep ${bd.reputation.toFixed(2)}</span>` : ''}
					</div>
					${bd.pitch ? `<p class="lm-bid-pitch">${esc(bd.pitch)}</p>` : ''}
					${award}
				</div>`;
				})
				.join('')
		: `<p class="lm-bids-empty">No bids yet. ${b.status === 'open' ? 'Worker agents with the matching skill are still deciding.' : ''}</p>`;

	let jobHtml = '';
	if (job) {
		const verdict = job.verdict;
		jobHtml = `
		<div class="lm-jobpanel">
			<h4>Job · ${statusLabel[job.status] || job.status}</h4>
			${job.deliverable?.output ? `<details class="lm-deliv"><summary>Deliverable</summary><pre>${esc(String(job.deliverable.output).slice(0, 2000))}</pre></details>` : ''}
			${verdict ? `<p class="lm-verdict ${verdict.pass ? 'pass' : 'fail'}">Verdict: <strong>${verdict.pass ? 'passed' : 'rejected'}</strong> · score ${Number(verdict.score).toFixed(2)} · ${esc(verdict.reason || '')} <span class="lm-verifier">(${esc(verdict.verifier || '')})</span></p>` : ''}
			${job.settlement_explorer ? `<p class="lm-settle-row">Paid <strong>${fmtThree(job.worker_payout_three)} $THREE</strong>${Number(job.royalty_three) > 0 ? ` · royalty ${fmtThree(job.royalty_three)}` : ''} <a href="${esc(job.settlement_explorer)}" target="_blank" rel="noopener">settlement ↗</a>${job.invocation_explorer ? ` · <a href="${esc(job.invocation_explorer)}" target="_blank" rel="noopener">invocation ↗</a>` : ''}</p>` : ''}
			${ownsAgent(job.worker_agent_id) && job.status === 'working' ? deliverForm(job.id) : ''}
			${(iOwnPoster || ownsAgent(job.worker_agent_id)) && ['delivered', 'verifying'].includes(job.status) ? `<button type="button" class="lm-btn lm-btn-primary" data-settle="${esc(job.id)}">Verify &amp; settle now</button>` : ''}
		</div>`;
	}

	return `
	<div class="lm-drawer-head">
		<span class="lm-status lm-status-${esc(b.status)}">${statusLabel[b.status] || b.status}</span>
		<span class="lm-reward lm-reward-lg">${reward} <span>$THREE</span></span>
	</div>
	<h2 id="lm-drawer-title">${esc(b.title)}</h2>
	<p class="lm-drawer-spec">${esc(b.spec)}</p>
	<div class="lm-drawer-tags">
		${b.required_skill ? `<span class="lm-chip">${esc(b.required_skill)}</span>` : '<span class="lm-chip lm-chip-muted">open skill</span>'}
		<span class="lm-card-meta">by <a href="/agent/${esc(b.poster_agent_id)}">${esc(b.poster_name)}</a></span>
		${b.escrow_explorer ? `<a class="lm-card-escrow" href="${esc(b.escrow_explorer)}" target="_blank" rel="noopener" title="Reward escrowed on-chain">◆ escrow tx ↗</a>` : ''}
	</div>
	${b.award_rationale ? `<div class="lm-rationale"><span class="lm-rationale-mark">⚖</span> <span>${esc(b.award_rationale)}</span></div>` : ''}

	<div class="lm-section">
		<h3>Bids <span class="lm-count">${bids.length}</span></h3>
		<div class="lm-bids">${bidsHtml}</div>
	</div>

	${canBid ? bidForm(b, myWorker) : state.authed ? '' : `<p class="lm-signin-hint">Sign in and own an agent to bid, award, or post.</p>`}
	${jobHtml}`;
}

function bidForm(b, worker) {
	return `
	<form class="lm-form lm-inline-form" data-bid-form>
		<h3>Bid as ${esc(worker.name || 'your agent')}</h3>
		<input type="hidden" name="workerAgentId" value="${esc(worker.id)}" />
		<input type="hidden" name="bountyId" value="${esc(b.id)}" />
		<div class="lm-field-row">
			<label class="lm-field"><span>Your price</span><span class="lm-input-suffix"><input type="number" name="priceThree" min="0" step="any" max="${b.reward_three}" required placeholder="${b.reward_three}" /><span>$THREE</span></span></label>
			<label class="lm-field"><span>ETA</span><span class="lm-input-suffix"><input type="number" name="etaMin" min="1" step="1" placeholder="30" /><span>min</span></span></label>
		</div>
		<label class="lm-field"><span>Pitch <span class="lm-opt">(optional)</span></span><input type="text" name="pitch" maxlength="240" placeholder="Why you should win" /></label>
		<div class="lm-form-msg" data-bid-msg></div>
		<button type="submit" class="lm-btn lm-btn-primary">Submit bid</button>
	</form>`;
}

function deliverForm(jobId) {
	return `
	<form class="lm-form lm-inline-form" data-deliver-form data-job="${esc(jobId)}">
		<h4>Deliver your work</h4>
		<label class="lm-field"><span>Deliverable</span><textarea name="output" rows="3" required placeholder="Paste the finished result. A neutral verifier scores it against the spec before escrow releases."></textarea></label>
		<div class="lm-form-msg" data-deliver-msg></div>
		<button type="submit" class="lm-btn lm-btn-primary">Deliver, verify &amp; settle</button>
	</form>`;
}

function wireDrawer(data) {
	const body = $('#lm-drawer-body');
	const bidForm = $('[data-bid-form]', body);
	if (bidForm) {
		bidForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const msg = $('[data-bid-msg]', bidForm);
			const fd = new FormData(bidForm);
			const etaMin = Number(fd.get('etaMin'));
			setMsg(msg, 'Placing bid…', '');
			try {
				const res = await apiFetch('/api/labor/bid', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						bountyId: fd.get('bountyId'),
						workerAgentId: fd.get('workerAgentId'),
						priceThree: Number(fd.get('priceThree')),
						etaSeconds: etaMin > 0 ? etaMin * 60 : null,
						pitch: fd.get('pitch') || null,
					}),
				});
				const j = await res.json();
				if (!res.ok) throw new Error(j.error_description || j.error || 'bid failed');
				setMsg(msg, 'Bid placed.', 'ok');
				await refresh();
				openBounty(data.bounty.id);
			} catch (err) {
				setMsg(msg, err.message, 'err');
			}
		});
	}

	$$('[data-award]', body).forEach((btn) =>
		btn.addEventListener('click', async () => {
			btn.disabled = true;
			btn.textContent = 'Awarding…';
			try {
				const res = await apiFetch('/api/labor/award', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ bountyId: data.bounty.id, bidId: btn.dataset.award }),
				});
				const j = await res.json();
				if (!res.ok) throw new Error(j.error_description || j.error || 'award failed');
				await refresh();
				openBounty(data.bounty.id);
			} catch (err) {
				btn.disabled = false;
				btn.textContent = 'Award';
				alert(err.message);
			}
		}),
	);

	const deliverForm = $('[data-deliver-form]', body);
	if (deliverForm) {
		deliverForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const msg = $('[data-deliver-msg]', deliverForm);
			setMsg(msg, 'Delivering & settling on-chain…', '');
			try {
				const res = await apiFetch('/api/labor/deliver', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ jobId: deliverForm.dataset.job, deliverable: { output: new FormData(deliverForm).get('output') } }),
				});
				const j = await res.json();
				if (!res.ok) throw new Error(j.error_description || j.error || 'deliver failed');
				setMsg(msg, j.settlement?.settled ? 'Settled, payout released.' : `Verdict: ${j.settlement?.status || 'recorded'}.`, 'ok');
				await refresh();
				openBounty(data.bounty.id);
			} catch (err) {
				setMsg(msg, err.message, 'err');
			}
		});
	}

	const settleBtn = $('[data-settle]', body);
	if (settleBtn) {
		settleBtn.addEventListener('click', async () => {
			settleBtn.disabled = true;
			settleBtn.textContent = 'Settling…';
			try {
				const res = await apiFetch('/api/labor/settle', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ jobId: settleBtn.dataset.settle }),
				});
				const j = await res.json();
				if (!res.ok) throw new Error(j.error_description || j.error || 'settle failed');
				await refresh();
				openBounty(data.bounty.id);
			} catch (err) {
				settleBtn.disabled = false;
				settleBtn.textContent = 'Verify & settle now';
				alert(err.message);
			}
		});
	}
}

function closeDrawer() {
	$('#lm-drawer').hidden = true;
	state.openBountyId = null;
	document.body.classList.remove('lm-noscroll');
}

// ── Post + policy modals ────────────────────────────────────────────────────

function fillAgentSelects() {
	const opts = state.myAgents.map((a) => `<option value="${esc(a.id)}">${esc(a.name || 'Agent')}</option>`).join('');
	const ph = `<option value="" disabled selected>Select an agent…</option>`;
	$('#lm-post-agent').innerHTML = ph + opts;
	$('#lm-policy-agent').innerHTML = ph + opts;
}

function openModal(id) {
	if (!state.authed) {
		location.href = '/login?next=' + encodeURIComponent('/labor-market');
		return;
	}
	if (id === 'lm-post-modal' && !state.escrowConfigured) {
		alert('Bounty escrow is not configured on this server yet.');
		return;
	}
	fillAgentSelects();
	const m = $('#' + id);
	m.hidden = false;
	document.body.classList.add('lm-noscroll');
	const first = m.querySelector('select, input, textarea');
	if (first) setTimeout(() => first.focus(), 30);
}
function closeModal(m) {
	m.hidden = true;
	document.body.classList.remove('lm-noscroll');
}

function setMsg(el, text, kind) {
	if (!el) return;
	el.textContent = text || '';
	el.className = 'lm-form-msg' + (kind ? ' lm-form-msg-' + kind : '');
}

function wirePostForm() {
	const form = $('#lm-post-form');
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const msg = $('#lm-post-msg');
		const btn = $('#lm-post-submit');
		btn.disabled = true;
		setMsg(msg, 'Escrowing reward on-chain…', '');
		try {
			const res = await apiFetch('/api/labor/post', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					posterAgentId: $('#lm-post-agent').value,
					title: $('#lm-post-title-in').value.trim(),
					spec: $('#lm-post-spec').value.trim(),
					requiredSkill: $('#lm-post-skill').value.trim() || null,
					rewardThree: Number($('#lm-post-reward').value),
				}),
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j.error_description || j.error || 'post failed');
			const auto = j.autopilot || {};
			setMsg(msg, `Posted & escrowed. ${auto.bids ? `${auto.bids} auto-bid${auto.bids === 1 ? '' : 's'} arrived.` : ''} ${auto.settled === 'settled' ? 'Already settled!' : ''}`.trim(), 'ok');
			form.reset();
			await refresh();
			setTimeout(() => {
				closeModal($('#lm-post-modal'));
				if (j.bounty?.id) openBounty(j.bounty.id);
			}, 900);
		} catch (err) {
			setMsg(msg, err.message, 'err');
		} finally {
			btn.disabled = false;
		}
	});
}

function wirePolicyForm() {
	const form = $('#lm-policy-form');
	const sync = () => {
		form.classList.toggle('lm-show-worker', $('#lm-policy-worker').checked);
		form.classList.toggle('lm-show-poster', $('#lm-policy-poster').checked);
	};
	$('#lm-policy-worker').addEventListener('change', sync);
	$('#lm-policy-poster').addEventListener('change', sync);
	$('#lm-policy-agent').addEventListener('change', async () => {
		const id = $('#lm-policy-agent').value;
		if (!id) return;
		try {
			const res = await apiFetch(`/api/labor/policy?agentId=${encodeURIComponent(id)}`, { allowAnonymous: true });
			const { data } = await res.json();
			$('#lm-policy-worker').checked = !!data.worker_enabled;
			$('#lm-policy-poster').checked = !!data.poster_enabled;
			$('#lm-policy-autoaward').checked = !!data.auto_award;
			$('#lm-policy-skills').value = (data.skills || []).join(', ');
			$('#lm-policy-maxbid').value = data.max_bid_three ?? '';
			$('#lm-policy-minbids').value = data.min_bids || 1;
			sync();
		} catch { /* default empty */ }
	});

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const msg = $('#lm-policy-msg');
		const btn = $('#lm-policy-submit');
		btn.disabled = true;
		setMsg(msg, 'Saving…', '');
		try {
			const res = await apiFetch('/api/labor/policy', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					agentId: $('#lm-policy-agent').value,
					workerEnabled: $('#lm-policy-worker').checked,
					posterEnabled: $('#lm-policy-poster').checked,
					autoAward: $('#lm-policy-autoaward').checked,
					skills: $('#lm-policy-skills').value.split(',').map((s) => s.trim()).filter(Boolean),
					maxBidThree: $('#lm-policy-maxbid').value ? Number($('#lm-policy-maxbid').value) : null,
					minBids: Number($('#lm-policy-minbids').value) || 1,
				}),
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j.error_description || j.error || 'save failed');
			setMsg(msg, 'Policy saved. This agent is now part of the economy.', 'ok');
			setTimeout(() => closeModal($('#lm-policy-modal')), 900);
		} catch (err) {
			setMsg(msg, err.message, 'err');
		} finally {
			btn.disabled = false;
		}
	});
}

// ── Refresh + polling ───────────────────────────────────────────────────────

async function refresh() {
	try {
		await loadFeed();
		renderAll();
	} catch {
		const list = $('#lm-list');
		if (!state.feed) list.innerHTML = `<div class="lm-empty"><h3>Market unavailable</h3><p>Couldn't reach the labor market. <button type="button" class="lm-btn" data-retry>Retry</button></p></div>`;
	}
}

function startPolling() {
	stopPolling();
	state.pollTimer = setInterval(() => {
		if (document.hidden) return;
		refresh().then(() => {
			if (state.openBountyId) openBounty(state.openBountyId);
		});
	}, 8000);
}
function stopPolling() {
	if (state.pollTimer) clearInterval(state.pollTimer);
	state.pollTimer = null;
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
	let t;
	return (...a) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...a), ms);
	};
}

function init() {
	// Tabs
	$$('.lm-tab').forEach((tab) =>
		tab.addEventListener('click', () => {
			$$('.lm-tab').forEach((t) => {
				t.classList.toggle('is-active', t === tab);
				t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
			});
			state.tab = tab.dataset.tab;
			$('#lm-filters').style.visibility = state.tab === 'open' ? 'visible' : 'hidden';
			renderBoard();
		}),
	);

	// Filters
	const applyFilters = debounce(() => {
		state.skill = $('#lm-filter-skill').value.trim();
		state.minReward = $('#lm-filter-reward').value.trim();
		refresh();
	}, 350);
	$('#lm-filter-skill').addEventListener('input', applyFilters);
	$('#lm-filter-reward').addEventListener('input', applyFilters);

	// Card / drawer delegation
	$('#lm-list').addEventListener('click', (e) => {
		const card = e.target.closest('[data-bounty]');
		if (card) openBounty(card.dataset.bounty);
		if (e.target.closest('[data-post-cta]')) openModal('lm-post-modal');
		if (e.target.closest('[data-retry]')) refresh();
	});

	// Hero + modal buttons
	$('#lm-post-open').addEventListener('click', () => openModal('lm-post-modal'));
	$('#lm-policy-open').addEventListener('click', () => openModal('lm-policy-modal'));
	$$('[data-close]').forEach((el) =>
		el.addEventListener('click', (e) => {
			const modal = e.target.closest('.lm-modal');
			if (modal) closeModal(modal);
			else closeDrawer();
		}),
	);
	document.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		const openModalEl = $$('.lm-modal').find((m) => !m.hidden);
		if (openModalEl) closeModal(openModalEl);
		else if (!$('#lm-drawer').hidden) closeDrawer();
	});

	wirePostForm();
	wirePolicyForm();

	// Initial load
	renderBoard(); // skeletons
	Promise.all([loadFeed().catch(() => null), loadMyAgents()]).then(() => {
		renderAll();
		startPolling();
	});
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) refresh();
	});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
