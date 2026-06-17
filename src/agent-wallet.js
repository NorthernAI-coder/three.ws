/**
 * Agent Wallet hub — page entry.
 *
 * Route: /agent/:id/wallet (also accepts ?id=<uuid>). Resolves the agent, then
 * mounts the tabbed hub (Balance · Deposit · Trade · Snipe · Pay · Withdraw).
 *
 * Every page state is designed: loading skeleton, not-found, fetch error (with
 * retry), and the live hub. Owner vs visitor is decided server-side by the
 * agent record's `is_owner`.
 */

import { mountAgentWalletHub } from './agent-wallet-hub/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveAgentId() {
	const fromQuery = new URLSearchParams(location.search).get('id');
	if (fromQuery) return fromQuery;
	// /agent/:id/wallet  or  /agents/:id/wallet
	const m = location.pathname.match(/\/agents?\/([^/]+)\/wallet/);
	return m ? decodeURIComponent(m[1]) : null;
}

const root = document.getElementById('awh-root');

function escapeHtml(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

function renderLoading() {
	root.innerHTML = `
		<div class="awh-page-skel" aria-busy="true" aria-label="Loading agent wallet">
			<div class="awh-page-skel-row"></div>
			<div class="awh-page-skel-tabs"></div>
			<div class="awh-page-skel-card"></div>
		</div>`;
}

function renderMessage({ title, body, actionHref, actionLabel, retry }) {
	root.innerHTML = `
		<div class="awh-page-msg" role="alert">
			<h1>${escapeHtml(title)}</h1>
			<p>${escapeHtml(body)}</p>
			<div class="awh-page-msg-actions">
				${actionHref ? `<a class="awh-page-btn awh-page-btn--primary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel || 'Continue')}</a>` : ''}
				${retry ? `<button class="awh-page-btn" type="button" data-act="retry">Try again</button>` : ''}
			</div>
		</div>`;
	if (retry) root.querySelector('[data-act="retry"]')?.addEventListener('click', () => load());
}

async function load() {
	const agentId = resolveAgentId();
	if (!agentId || !UUID_RE.test(agentId)) {
		renderMessage({
			title: 'No agent selected',
			body: 'This page needs an agent. Open it from an agent profile, or create your first agent to get a self-custodied Solana wallet.',
			actionHref: '/create-agent',
			actionLabel: 'Create an agent',
		});
		document.title = 'Agent wallet — three.ws';
		return;
	}

	renderLoading();

	let agent;
	try {
		const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
			credentials: 'include',
			headers: { accept: 'application/json' },
		});
		if (res.status === 404) {
			renderMessage({
				title: 'Agent not found',
				body: 'This agent doesn’t exist or has been removed. It may have been deleted by its owner.',
				actionHref: '/agents',
				actionLabel: 'Browse agents',
			});
			document.title = 'Agent not found — three.ws';
			return;
		}
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		agent = data.agent;
		if (!agent) throw new Error('empty agent payload');
	} catch {
		renderMessage({
			title: 'Couldn’t load this wallet',
			body: 'We couldn’t reach the agent service. This is usually temporary — check your connection and try again.',
			retry: true,
		});
		document.title = 'Agent wallet — three.ws';
		return;
	}

	document.title = `${agent.name || 'Agent'} wallet — three.ws`;

	mountAgentWalletHub({ mount: root, agent });
}

load();
