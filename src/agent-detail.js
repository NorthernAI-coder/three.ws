/**
 * Rich agent detail page.
 *
 * Loads via /api/agents/:id (UUID) and /api/avatars/:id for the image.
 * Falls back to a 404 view when the id is unknown or fetch fails.
 *
 * Owner-private fields (chain_id, wallet_address, erc8004_*) only appear when
 * the requester is the agent's owner — render() tolerates them being absent.
 */

import {
	Connection,
	PublicKey,
	Transaction,
	SystemProgram,
	LAMPORTS_PER_SOL,
	clusterApiUrl,
} from '@solana/web3.js';
const solanaWeb3 = {
	Connection,
	PublicKey,
	Transaction,
	SystemProgram,
	LAMPORTS_PER_SOL,
	clusterApiUrl,
};
import { openSwapModal } from './swap-jupiter.js';
import { onchainBadgeEl } from './shared/onchain-badge.js';
import { mountValidationBadge } from './shared/validation-badge.js';
import { seeInWorldHref, agentAvatarGlb } from './shared/agent-3d.js';
import { renderError as renderAsyncError } from './shared/async-state.js';
import { openCoinLaunch } from './shared/agent-coin.js';
import { Modal } from './shared/modal.js';
import { showSharePanel } from './shared/share.js';
import { enrichAgentDetail, renderEmbed as renderAgentEmbed } from './agent-detail-market.js';
import { log } from './shared/log.js';
import { mountViewSwitcher } from './view-switcher.js';
import { mountCoinStatus } from './pump/coin-status-card.js';

// Live coin-status widgets mounted on this page (token chip + launch-history
// rows). Tracked so a re-render (e.g. avatar refresh) tears down their refresh
// timers before remounting, rather than leaking intervals.
const coinStatusHandles = [];

function destroyCoinStatus() {
	while (coinStatusHandles.length) {
		const h = coinStatusHandles.pop();
		try {
			h.destroy();
		} catch {
			/* ignore */
		}
	}
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SERVICE_TYPES = {
	web: { tag: 'WEB' },
	a2a: { tag: 'A2A' },
	mcp: { tag: 'MCP' },
	token: { tag: 'TOKEN' },
	dbc: { tag: 'DBC' },
	chart: { tag: 'CHART' },
};

const TRUST_ACCENT = {
	reputation: 'amber',
	'crypto-economic': 'violet',
	tee: 'green',
};

const GRADIENTS = [
	['#555577', '#4f46e5'],
	['#0ea5e9', '#ffffff'],
	['#10b981', '#0ea5e9'],
	['#f59e0b', '#ef4444'],
	['#ec4899', '#ffffff'],
	['#14b8a6', '#3b82f6'],
];

function avatarDataUri(name) {
	const [c1, c2] = GRADIENTS[(name?.charCodeAt(0) || 0) % GRADIENTS.length];
	const letter = (name || '?')[0].toUpperCase();
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168" viewBox="0 0 168 168"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="168" height="168" rx="24" fill="url(#g)"/><text x="50%" y="55%" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="80" font-weight="600" fill="white">${letter}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function shortAddr(s, head = 4, tail = 4) {
	if (!s) return '—';
	const str = String(s);
	if (str.length <= head + tail + 1) return str;
	return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function el(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (v == null || v === false) continue;
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
		else node.setAttribute(k, v);
	}
	for (const c of [].concat(children || [])) {
		if (c == null) continue;
		node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return node;
}

function pill(text, accent = '') {
	return el('span', { class: `ad-pill ${accent ? `ad-pill-${accent}` : ''}`, text });
}

// ── Launch history ───────────────────────────────────────────────────────────
// Every coin this agent has launched through the platform, newest first, from
// GET /api/pump/by-agent (pump_agent_mints registry). Live market caps stream
// in per row from the shared coin-status widget (`row` variant). Links into the
// public /launches feed.

function launchTimeAgo(iso) {
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function renderLaunchHistory(container, agent) {
	if (!agent.id) return;
	let coins = [];
	try {
		const r = await fetch(`/api/pump/by-agent?agent_id=${encodeURIComponent(agent.id)}`);
		if (!r.ok) return;
		const body = await r.json();
		coins = Array.isArray(body.coins) ? body.coins : [];
	} catch {
		return; // history is supplementary — the primary token chip still renders
	}
	if (!coins.length) return;

	// A single launch that is already shown as the agent token chip above would
	// be pure duplication — just add the public-feed link in that case.
	const onlyDuplicatesChip =
		coins.length === 1 && agent.token && coins[0].mint === agent.token.mint;

	container.classList.remove('ad-muted');
	if (container.textContent === 'No agent token linked for this agent yet.') {
		container.textContent = '';
	}

	const box = el('div', { class: 'ad-launch-history' });

	if (!onlyDuplicatesChip) {
		box.appendChild(
			el('div', { class: 'ad-launch-history-head', text: `Launched coins (${coins.length})` }),
		);
		for (const coin of coins) {
			const isDevnet = coin.network === 'devnet';
			const href = isDevnet
				? `https://explorer.solana.com/address/${coin.mint}?cluster=devnet`
				: `https://pump.fun/${coin.mint}`;
			const row = el('a', {
				class: 'ad-launch-row',
				href,
				target: '_blank',
				rel: 'noopener noreferrer',
				'aria-label': `${coin.symbol || coin.name || 'coin'} on ${isDevnet ? 'Solana Explorer' : 'pump.fun'}`,
			});
			box.appendChild(row);
			if (isDevnet) {
				// Devnet mints have no pump.fun market data — render the static row.
				row.append(
					el('span', { class: 'ad-launch-symbol', text: coin.symbol ? `$${coin.symbol}` : coin.name || '—' }),
					el('span', { class: 'ad-mono ad-launch-mint', text: shortAddr(coin.mint) }),
					el('span', { class: 'ad-launch-time', text: launchTimeAgo(coin.created_at) }),
				);
			} else {
				// Live market cap + time stream in through the shared widget — one
				// /api/pump/coin fetch per row, mapped and formatted in one place.
				coinStatusHandles.push(mountCoinStatus(row, coin.mint, { variant: 'row' }));
			}
		}
	}

	box.appendChild(
		el('a', {
			class: 'ad-launch-feed-link',
			href: `/launches?agent_id=${encodeURIComponent(agent.id)}`,
			text: 'View in the public launch feed →',
		}),
	);
	container.appendChild(box);
}

// ── Holder cohorts panel ─────────────────────────────────────────────────────
// Renders the live holder segmentation for an agent token from
// GET /api/coin/:mint/cohorts. Self-manages loading / empty / error / populated
// states so the caller just hands it a container and a mint.

const COHORT_ICONS = {
	holders: '👥',
	whales: '🐋',
	'diamond-hands': '💎',
	'new-buyers': '🌱',
	exited: '🚪',
};

const CONC_LABELS = {
	healthy: 'Healthy spread',
	moderate: 'Moderate',
	high: 'Concentrated',
	'very-high': 'Highly concentrated',
	none: '—',
};

function fmtInt(n) {
	return Number(n || 0).toLocaleString('en-US');
}

function fmtPct(frac) {
	const v = Number(frac || 0) * 100;
	return `${v >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

function cohortsSkeleton() {
	return el('div', {}, [
		el('div', { class: 'ad-cohorts-head' }, [
			el('span', { class: 'ad-cohorts-title', text: 'HOLDERS' }),
			el('span', { class: 'ad-skel ad-skel-count' }),
		]),
		el('div', { class: 'ad-cohorts-body' }, [
			el('div', { class: 'ad-skel ad-skel-row' }),
			el('div', { class: 'ad-skel ad-skel-row' }),
		]),
	]);
}

function cohortsErrorState(retry) {
	const btn = el('button', { class: 'ad-cohorts-retry', type: 'button', text: 'Retry' });
	btn.addEventListener('click', retry);
	return el('div', { class: 'ad-cohorts-err' }, [
		el('span', { class: 'ad-muted', text: 'Couldn’t load holder cohorts.' }),
		btn,
	]);
}

function cohortRow(c, frac) {
	const pct = Math.max(0, Math.min(1, frac));
	return el('div', { class: 'ad-cohort-row', title: c.description || c.name }, [
		el('span', { class: 'ad-cohort-name' }, [
			el('span', { class: 'ad-cohort-icon', text: COHORT_ICONS[c.id] || '•' }),
			el('span', { text: c.name }),
		]),
		el('span', { class: 'ad-cohort-bar' }, [
			el('span', { class: 'ad-cohort-fill', style: `width:${(pct * 100).toFixed(1)}%` }),
		]),
		el('span', { class: 'ad-cohort-val', text: `${fmtInt(c.count)} · ${fmtPct(frac)}` }),
	]);
}

function cohortsView(data) {
	const holderCount =
		data.holderCount ?? (data.cohorts || []).find((c) => c.id === 'holders')?.count ?? 0;
	const nodes = [
		el('div', { class: 'ad-cohorts-head' }, [
			el('span', { class: 'ad-cohorts-title', text: 'HOLDERS' }),
			el('span', { class: 'ad-cohorts-count', text: fmtInt(holderCount) }),
		]),
	];

	if (!holderCount) {
		nodes.push(
			el('div', { class: 'ad-cohorts-empty', text: 'No holders yet — be the first.' }),
		);
		return nodes;
	}

	const locked = [];
	const body = el('div', { class: 'ad-cohorts-body' });
	for (const c of data.cohorts || []) {
		if (c.id === 'holders') continue; // the header already shows the total
		if (c.count == null) {
			locked.push(c.name);
			continue;
		}
		body.appendChild(cohortRow(c, holderCount ? c.count / holderCount : 0));
	}
	if (body.childNodes.length) nodes.push(body);

	const con = data.concentration;
	if (con) {
		nodes.push(
			el('div', { class: 'ad-cohorts-conc' }, [
				el('span', {
					class: `ad-conc-chip ad-conc-${con.label || 'none'}`,
					text: CONC_LABELS[con.label] || con.label || '—',
				}),
				el('span', {
					class: 'ad-cohorts-conc-detail',
					text: `Top holder ${fmtPct(con.top1Share)} · Top 10 ${fmtPct(con.top10Share)}`,
				}),
			]),
		);
	}

	if (locked.length) {
		nodes.push(
			el('div', {
				class: 'ad-cohorts-note',
				text: `${locked.join(' · ')} unlock once holder history is recorded.`,
			}),
		);
	}
	return nodes;
}

async function renderHolderCohorts(box, mint) {
	box.classList.add('ad-cohorts');
	box.replaceChildren(cohortsSkeleton());
	let data;
	try {
		const r = await fetch(`/api/coin/${encodeURIComponent(mint)}/cohorts`, {
			credentials: 'include',
		});
		if (!r.ok) throw new Error(String(r.status));
		data = await r.json();
	} catch {
		box.replaceChildren(cohortsErrorState(() => renderHolderCohorts(box, mint)));
		return;
	}
	box.replaceChildren(...cohortsView(data));
}

function renderService(svc) {
	const meta = SERVICE_TYPES[svc.type] || { tag: (svc.type || '').toUpperCase() };
	const head = el('div', { class: 'ad-svc-head' }, [
		el('span', { class: 'ad-svc-tag', text: meta.tag }),
		svc.version ? el('span', { class: 'ad-svc-version', text: svc.version }) : null,
		svc.label ? el('span', { class: 'ad-svc-version', text: svc.label }) : null,
	]);

	const card = el('div', { class: 'ad-svc' }, [head]);

	if (svc.url) {
		card.appendChild(
			el('div', { class: 'ad-svc-link' }, [
				el('span', { text: '🔗' }),
				el('span', { text: svc.url }),
				el(
					'button',
					{
						class: 'ad-copy',
						'aria-label': 'Copy',
						onclick: () => navigator.clipboard?.writeText(svc.url),
					},
					'⧉',
				),
			]),
		);
	}

	const metaItems = [];
	if (svc.skills?.length) {
		metaItems.push(el('span', { class: 'ad-svc-meta-label', text: 'SKILLS' }));
		svc.skills.forEach((s) => metaItems.push(el('span', { class: 'ad-chip', text: s })));
	}
	if (svc.domains?.length) {
		metaItems.push(el('span', { class: 'ad-svc-meta-label', text: 'DOMAINS' }));
		svc.domains.forEach((s) => metaItems.push(el('span', { class: 'ad-chip', text: s })));
	}
	if (metaItems.length) card.appendChild(el('div', { class: 'ad-svc-meta' }, metaItems));

	return card;
}

function render(agent) {
	document.title = `${agent.name} — three.ws`;

	const $ = (id) => document.getElementById(id);

	$('ad-avatar').src = agent.avatar || avatarDataUri(agent.name);
	$('ad-avatar').alt = agent.name;
	$('ad-avatar').onerror = () => {
		$('ad-avatar').src = avatarDataUri(agent.name);
	};
	$('ad-name').textContent = agent.name;

	// Let visitors save this agent's avatar as their own fork (its wallet is
	// already managed in the holdings panel below, so fork-only here).
	const fork = $('ad-avatar-actions');
	if (fork && agent.avatar_id) {
		if (!customElements.get('avatar-actions') && !document.querySelector('script[data-avatar-actions]')) {
			const s = document.createElement('script');
			s.type = 'module';
			s.src = '/avatar-actions.js';
			s.dataset.avatarActions = '1';
			document.head.appendChild(s);
		}
		fork.setAttribute('avatar-id', agent.avatar_id);
		fork.style.display = 'block';
	}

	// "See in 3D" drops this agent's avatar into the live $three world. Every
	// agent has one — its own GLB if attached, the base mannequin otherwise — so
	// the button is always live. Marketplace enrichment upgrades the href to a
	// richer custom GLB if the agent ships one.
	const see3d = $('ad-see-3d');
	if (see3d) see3d.href = seeInWorldHref(agent);

	// View switcher: flip this agent between its detail, 3D world, and embed
	// presentations. Every agent has a 3D body (custom GLB or mannequin).
	mountViewSwitcher($('view-switch-slot'), {
		kind: 'agent',
		id: agent.id,
		active: new URLSearchParams(location.search).get('view') === 'embed' ? 'embed' : 'detail',
		worldHref: seeInWorldHref(agent),
	});

	// Embed snippets work for every agent, not just marketplace-published ones,
	// so the "Embed" view always lands on real, copyable code. Marketplace
	// enrichment later refreshes this with the canonical GLB if it differs.
	renderAgentEmbed({ ...agent, avatar_glb_url: agent.avatar_glb_url || agentAvatarGlb(agent) });

	const status = $('ad-status');
	status.textContent = agent.active ? 'Active' : 'Inactive';
	status.classList.toggle('ad-status-inactive', !agent.active);

	// On-chain badge sits beside the live/inactive status. Re-rendered safely if
	// render() runs twice (e.g. avatar refresh) — drop any prior badge first.
	document.getElementById('ad-onchain-badge')?.remove();
	const onchainBadge = onchainBadgeEl(agent.rawMetadata || agent, { size: 'md' });
	if (onchainBadge) {
		onchainBadge.id = 'ad-onchain-badge';
		status.insertAdjacentElement('afterend', onchainBadge);
	}

	// Validation attestation badge — only for EVM ERC-8004 agents, read
	// walletlessly from the on-chain ValidationRegistry. Re-mountable on refresh.
	let validationSlot = document.getElementById('ad-validation-badge');
	if (agent.chainId && agent.erc8004AgentId) {
		if (!validationSlot) {
			validationSlot = document.createElement('span');
			validationSlot.id = 'ad-validation-badge';
			validationSlot.style.marginLeft = '8px';
			(onchainBadge || status).insertAdjacentElement('afterend', validationSlot);
		}
		mountValidationBadge({
			container: validationSlot,
			chainId: agent.chainId,
			agentId: agent.erc8004AgentId,
			isOwner: agent.isOwner,
			glbUrl: agent.glbUrl || undefined,
		});
	} else {
		validationSlot?.remove();
	}

	$('ad-id-short').textContent = shortAddr(agent.id);
	$('ad-id-short').dataset.full = agent.id;
	$('ad-asset-kind').textContent = agent.assetKind || 'Core Asset';
	$('ad-desc').textContent = agent.description || '';

	const trustPills = $('ad-trust-pills');
	trustPills.innerHTML = '';
	(agent.trust || []).forEach((t) =>
		trustPills.appendChild(pill(t, TRUST_ACCENT[t.toLowerCase()] || '')),
	);

	const services = $('ad-services');
	services.innerHTML = '';
	(agent.services || []).forEach((s) => services.appendChild(renderService(s)));
	$('ad-svc-count').textContent = `${agent.services?.length || 0} configured`;
	$('ad-svc-count2').textContent = String(agent.services?.length || 0);

	$('ad-holdings-addr').textContent = shortAddr(agent.wallet);
	$('ad-holdings-addr').dataset.full = agent.wallet;
	$('ad-holdings-sol').textContent = String(agent.solBalance ?? 0);

	// A re-render (avatar refresh) clears the token body below; tear down any
	// coin-status widgets first so their refresh timers don't leak.
	destroyCoinStatus();

	if (agent.token) {
		$('ad-token-body').classList.remove('ad-muted');
		$('ad-token-body').textContent = '';
		// Live token chip — symbol · price · market cap · graduation %, streamed
		// and formatted by the shared coin-status widget. Devnet tokens (no
		// pump.fun market data) fall back to a static symbol + mint row.
		if (agent.token.cluster === 'devnet') {
			$('ad-token-body').appendChild(
				el('div', { class: 'ad-row ad-row-split' }, [
					el('span', { text: agent.token.symbol || 'TOKEN' }),
					el('span', { class: 'ad-mono', text: shortAddr(agent.token.mint) }),
				]),
			);
		} else {
			const chipBox = el('div', { class: 'ad-token-chip' });
			$('ad-token-body').appendChild(chipBox);
			coinStatusHandles.push(mountCoinStatus(chipBox, agent.token.mint, { variant: 'chip' }));
		}
		const dashLink =
			agent.token.pumpfun_url ||
			(agent.token.cluster === 'devnet'
				? `https://explorer.solana.com/address/${agent.token.mint}?cluster=devnet`
				: `https://pump.fun/${agent.token.mint}`);
		const viewBtn = el('a', {
			class: 'ad-token-cta',
			href: dashLink,
			target: '_blank',
			rel: 'noopener noreferrer',
			text: `View on ${agent.token.cluster === 'devnet' ? 'Solana Explorer' : 'pump.fun'} →`,
		});
		$('ad-token-body').appendChild(viewBtn);

		// Live holder segmentation for this token — fire-and-forget; the panel
		// renders its own loading / empty / error / populated states.
		const cohortsBox = el('div', { class: 'ad-cohorts' });
		$('ad-token-body').appendChild(cohortsBox);
		renderHolderCohorts(cohortsBox, agent.token.mint);
	} else if (agent.isOwner) {
		$('ad-token-body').classList.remove('ad-muted');
		$('ad-token-body').textContent = '';
		const launchBtn = el('button', {
			class: 'ad-token-cta',
			type: 'button',
			text: '🚀 Launch agent token',
		});
		launchBtn.addEventListener('click', async () => {
			launchBtn.disabled = true;
			try {
				await openCoinLaunch(agent);
			} finally {
				launchBtn.disabled = false;
			}
		});
		$('ad-token-body').appendChild(launchBtn);
	}

	// Full launch history from the pump_agent_mints registry — fire-and-forget;
	// renders nothing extra when the agent has no launches beyond the chip above.
	renderLaunchHistory($('ad-token-body'), agent);

	$('ad-rewards').textContent = String(agent.creatorRewards ?? 0);

	const mechs = $('ad-trust-mechs');
	mechs.innerHTML = '';
	(agent.trust || []).forEach((t) =>
		mechs.appendChild(pill(t, TRUST_ACCENT[t.toLowerCase()] || '')),
	);

	const pay = $('ad-payment');
	pay.innerHTML = '';
	pay.appendChild(
		pill(agent.x402 ? 'x402 Supported' : 'x402 Not Supported', agent.x402 ? 'green' : ''),
	);

	$('ad-agent-id').textContent = shortAddr(agent.id);
	const regs = $('ad-registries');
	regs.innerHTML = '';
	(agent.registries || []).forEach((r) => regs.appendChild(pill(r)));

	$('ad-raw').textContent = JSON.stringify(agent.rawMetadata || agent, null, 2);

	const onchain = $('ad-onchain');
	onchain.innerHTML = '';
	[
		['Agent UUID', shortAddr(agent.id)],
		['Agent Wallet', shortAddr(agent.wallet)],
		['Owner', shortAddr(agent.owner)],
		['Authority', shortAddr(agent.authority)],
	].forEach(([k, v]) => {
		onchain.appendChild(
			el('div', { class: 'ad-row ad-row-split' }, [
				el('span', { class: 'ad-muted', text: k }),
				el('span', { class: 'ad-mono', text: v }),
			]),
		);
	});

	$('ad-active').textContent = agent.active ? 'true' : 'false';
	$('ad-x402').textContent = agent.x402 ? 'Yes' : 'No';

	const supportedTrust = $('ad-supported-trust');
	supportedTrust.innerHTML = '';
	(agent.trust || []).forEach((t) =>
		supportedTrust.appendChild(pill(t, TRUST_ACCENT[t.toLowerCase()] || '')),
	);

	const protos = $('ad-protocols');
	protos.innerHTML = '';
	(agent.protocols || []).forEach((p) => protos.appendChild(pill(p)));

	if (agent.explorerUrl && agent.explorerUrl !== '#') $('ad-explorer').href = agent.explorerUrl;
	else $('ad-explorer').style.display = 'none';
	if (agent.tradeUrl && agent.tradeUrl !== '#') $('ad-trade').href = agent.tradeUrl;
	else $('ad-trade').style.display = 'none';

	const attachedSns = agent.rawMetadata?.meta?.sns_domain;
	const solAddress = agent.rawMetadata?.meta?.solana_address;
	if (attachedSns) {
		document.getElementById('ad-sns-row').style.display = '';
		document.getElementById('ad-sns').textContent = `${attachedSns}.sol`;
	} else if (solAddress) {
		// Lazy reverse-lookup of the wallet's on-chain favorite. Fire-and-forget;
		// 404s and timeouts just leave the row hidden — non-essential UX.
		fetch(`/api/sns?address=${encodeURIComponent(solAddress)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				const name = body?.data?.name;
				if (!name) return;
				const row = document.getElementById('ad-sns-row');
				const span = document.getElementById('ad-sns');
				if (!row || !span) return;
				row.style.display = '';
				span.textContent = name;
				span.title = 'On-chain favorite domain';
			})
			.catch(() => {});
	}

	const voiceProvider = agent.rawMetadata?.voice_provider;
	const voiceId = agent.rawMetadata?.voice_id;
	if (voiceProvider && voiceProvider !== 'browser') {
		document.getElementById('ad-voice-row').style.display = '';
		document.getElementById('ad-voice').innerHTML =
			`<span class="ad-pill ad-pill-green">cloned · ${escapeText(voiceProvider)}</span>`;
	} else if (voiceProvider === 'browser') {
		document.getElementById('ad-voice-row').style.display = '';
		document.getElementById('ad-voice').textContent = 'browser TTS';
	}

	document.querySelector('.ad-main').classList.remove('loading');
	bindWalletActions(agent.isOwner);
	mountOwnerBar(agent);
	wireShareButton(agent);

	loadExtraSections(agent.id, agent.rawMetadata, agent.isOwner);

	// Layer the marketplace discovery + commerce features (3D avatar, live chat
	// preview, creator profile, skill pricing, sale panel, embed, similar,
	// versions) onto the canonical page. No-ops if the agent isn't published to
	// the marketplace, so the base page is never blocked.
	enrichAgentDetail(agent)
		.then(() => {
			// Embed view (from the view switcher): reveal and highlight the embed
			// snippets once enrichment has populated them.
			if (new URLSearchParams(location.search).get('view') === 'embed') focusEmbedSection();
		})
		.catch((e) => log.warn('[agent-detail] enrich failed:', e?.message));
}

// Scroll to the embed snippets and flash them — used by the ?view=embed
// deep-link so the switcher's "Embed" view lands on something concrete.
function focusEmbedSection() {
	const card = document.getElementById('ad-embed-card');
	if (!card || card.hidden) return;
	card.scrollIntoView({ behavior: 'smooth', block: 'center' });
	card.classList.add('ad-embed-flash');
	setTimeout(() => card.classList.remove('ad-embed-flash'), 1600);
}

async function loadExtraSections(agentId, rec, isOwner) {
	const url = (p) => `/api/agents/${encodeURIComponent(agentId)}${p}`;

	const safe = async (fn) => {
		try {
			return await fn();
		} catch (e) {
			return null;
		}
	};

	// Actions, memory and strategy are owner-only on the server (401/403 for
	// anyone else). Only request them when the viewer owns the agent, so public
	// visitors don't generate failed requests that pollute the console.
	const ownerOnly = (fn) => (isOwner ? safe(fn) : Promise.resolve(null));

	const [actions, memory, strategy, reputation, embedPolicy] = await Promise.all([
		ownerOnly(() => fetchJson(url('/actions?limit=8'))),
		ownerOnly(() =>
			fetch(`/api/agent-memory?agentId=${encodeURIComponent(agentId)}&limit=6`, {
				credentials: 'include',
			}).then((r) => (r.ok ? r.json() : null)),
		),
		ownerOnly(() =>
			fetch(`/api/agent-strategy?id=${encodeURIComponent(agentId)}`, {
				credentials: 'include',
			}).then((r) => (r.ok ? r.json() : null)),
		),
		safe(() => fetchJson(url('/reputation'))),
		safe(() =>
			fetch(url('/embed-policy'), { credentials: 'include' }).then((r) =>
				r.ok ? r.json() : null,
			),
		),
	]);

	if (actions?.actions?.length) renderActions(actions.actions, agentId);
	if (memory?.entries?.length) renderMemory(memory.entries);
	if (strategy?.data?.strategy != null) renderStrategy(strategy.data.strategy);
	if (reputation && (reputation.count > 0 || reputation.average > 0))
		renderReputation(reputation);
	if (embedPolicy) renderEmbedPolicy(embedPolicy);

	loadReviews(agentId, rec);
}

// ── Reviews ──────────────────────────────────────────────────────────────────

function starsHtml(rating, size = 'sm') {
	const full = Math.floor(rating);
	const half = rating - full >= 0.5;
	let html = '';
	for (let i = 1; i <= 5; i++) {
		if (i <= full) html += `<span class="ad-star filled" aria-hidden="true">★</span>`;
		else if (i === full + 1 && half)
			html += `<span class="ad-star half" aria-hidden="true">★</span>`;
		else html += `<span class="ad-star" aria-hidden="true">★</span>`;
	}
	return html;
}

function reviewAvatarEl(author) {
	const initial = (author?.author_name || '?')[0].toUpperCase();
	if (author?.author_avatar) {
		const img = el('img', {
			class: 'ad-review-avatar',
			src: author.author_avatar,
			alt: author.author_name || 'Reviewer',
		});
		img.onerror = () => {
			const span = el('div', { class: 'ad-review-avatar', text: initial });
			img.replaceWith(span);
		};
		return img;
	}
	return el('div', { class: 'ad-review-avatar', text: initial });
}

async function getCsrfToken() {
	try {
		const r = await fetch('/api/csrf-token', { credentials: 'include' });
		if (!r.ok) return null;
		const d = await r.json();
		return d.token || null;
	} catch {
		return null;
	}
}

async function loadReviews(agentId, agentRec) {
	const card = document.getElementById('ad-reviews-card');
	const body = document.getElementById('ad-reviews-body');
	const countPill = document.getElementById('ad-reviews-count');
	if (!card || !body) return;

	const isOwner = !!agentRec?.user_id;

	let data;
	try {
		const r = await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/reviews`, {
			credentials: 'include',
		});
		if (!r.ok) throw new Error(`${r.status}`);
		const json = await r.json();
		data = json.data;
	} catch (e) {
		body.innerHTML = `<div class="ad-reviews-error">Could not load reviews. Try refreshing.</div>`;
		return;
	}

	const { summary, reviews, my_review } = data;

	if (countPill) {
		countPill.textContent = summary.rating_count > 0 ? String(summary.rating_count) : '';
	}

	body.innerHTML = '';

	// Summary bar
	if (summary.rating_count > 0) {
		const total = summary.rating_count || 1;
		const avgDisplay = Number(summary.rating_avg).toFixed(1);
		const summaryEl = el('div', { class: 'ad-reviews-summary' }, [
			el('div', { class: 'ad-reviews-score' }, [
				el('div', { class: 'ad-reviews-avg', text: avgDisplay }),
				el('div', {
					class: 'ad-reviews-stars',
					'aria-label': `${avgDisplay} out of 5 stars`,
				}),
				el('div', {
					class: 'ad-reviews-total',
					text: `${summary.rating_count} review${summary.rating_count !== 1 ? 's' : ''}`,
				}),
			]),
			el(
				'div',
				{ class: 'ad-reviews-bars' },
				[5, 4, 3, 2, 1].map((star) => {
					const count = summary.breakdown?.[star] || 0;
					const pct = Math.round((count / total) * 100);
					return el('div', { class: 'ad-reviews-bar-row' }, [
						el('span', { class: 'ad-reviews-bar-label', text: String(star) }),
						el('span', { class: 'ad-star filled', 'aria-hidden': 'true', text: '★' }),
						el('div', { class: 'ad-reviews-bar-track' }, [
							el('div', { class: 'ad-reviews-bar-fill', style: `width:${pct}%` }),
						]),
						el('span', { class: 'ad-reviews-bar-count', text: String(count) }),
					]);
				}),
			),
		]);
		summaryEl.querySelector('.ad-reviews-stars').innerHTML = starsHtml(summary.rating_avg);
		body.appendChild(summaryEl);
	}

	// Write / edit form (skip if owner)
	if (!isOwner) {
		body.appendChild(
			buildReviewForm(agentId, my_review, (updated) => loadReviews(agentId, agentRec)),
		);
	}

	// Reviews list
	if (reviews.length === 0 && !my_review) {
		body.appendChild(
			el('div', { class: 'ad-reviews-empty' }, [
				el('strong', { text: 'No reviews yet' }),
				el('span', {
					text: isOwner
						? 'Reviews from users will appear here.'
						: 'Be the first to review this agent.',
				}),
			]),
		);
		return;
	}

	const list = el('div', { class: 'ad-reviews-list' });
	for (const r of reviews) {
		list.appendChild(buildReviewItem(r, agentId, () => loadReviews(agentId, agentRec)));
	}
	body.appendChild(list);
}

function buildReviewForm(agentId, existing, onSuccess) {
	let selectedRating = existing?.rating || 0;
	let submitting = false;

	const formTitle = el('div', {
		class: 'ad-review-form-title',
		text: existing ? 'Your Review' : 'Write a Review',
	});

	const starPicker = el('div', {
		class: 'ad-review-star-picker',
		role: 'radiogroup',
		'aria-label': 'Rating',
	});
	const starEls = [1, 2, 3, 4, 5].map((n) => {
		const s = el('span', {
			class: `ad-star${n <= selectedRating ? ' filled' : ''}`,
			role: 'radio',
			'aria-label': `${n} star${n !== 1 ? 's' : ''}`,
			'aria-checked': String(n === selectedRating),
			tabindex: '0',
			text: '★',
		});
		s.addEventListener('click', () => setRating(n));
		s.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				setRating(n);
			}
		});
		starPicker.appendChild(s);
		return s;
	});

	function setRating(n) {
		selectedRating = n;
		starEls.forEach((s, i) => {
			s.classList.toggle('filled', i < n);
			s.setAttribute('aria-checked', String(i + 1 === n));
		});
		submitBtn.disabled = false;
	}

	const textarea = el('textarea', {
		class: 'ad-review-textarea',
		placeholder: 'Share your experience with this agent… (optional)',
		maxlength: '2000',
		'aria-label': 'Review text',
	});
	textarea.value = existing?.body || '';

	const charCount = el('span', {
		class: 'ad-review-char-count',
		text: `${textarea.value.length}/2000`,
	});
	textarea.addEventListener('input', () => {
		charCount.textContent = `${textarea.value.length}/2000`;
	});

	const statusEl = el('span', { class: 'ad-review-char-count', style: 'color:var(--ad-muted)' });

	const submitBtn = el('button', {
		class: 'ad-review-submit',
		type: 'button',
		text: existing ? 'Update' : 'Submit',
		disabled: !existing && selectedRating === 0,
	});

	submitBtn.addEventListener('click', async () => {
		if (submitting || selectedRating === 0) return;
		submitting = true;
		submitBtn.disabled = true;
		submitBtn.textContent = 'Saving…';
		statusEl.textContent = '';

		try {
			const csrf = await getCsrfToken();
			const headers = { 'content-type': 'application/json' };
			if (csrf) headers['x-csrf-token'] = csrf;

			const r = await fetch(
				`/api/marketplace/agents/${encodeURIComponent(agentId)}/reviews`,
				{
					method: 'POST',
					credentials: 'include',
					headers,
					body: JSON.stringify({
						rating: selectedRating,
						body: textarea.value.trim() || null,
					}),
				},
			);
			const json = await r.json();
			if (!r.ok) {
				if (r.status === 401) {
					statusEl.innerHTML =
						'<a href="/sign-in" style="color:var(--ad-violet)">Sign in</a> to leave a review';
				} else {
					statusEl.textContent = json.error?.message || 'Save failed';
				}
				statusEl.style.color = r.status === 401 ? 'var(--ad-muted)' : '#ff8a80';
				submitBtn.disabled = false;
				submitBtn.textContent = existing ? 'Update' : 'Submit';
				submitting = false;
				return;
			}
			onSuccess(json.data);
		} catch (e) {
			statusEl.textContent = 'Network error';
			statusEl.style.color = '#ff8a80';
			submitBtn.disabled = false;
			submitBtn.textContent = existing ? 'Update' : 'Submit';
			submitting = false;
		}
	});

	const actions = el('div', { class: 'ad-review-form-actions' });
	if (existing) {
		const deleteBtn = el('button', {
			class: 'ad-review-delete',
			type: 'button',
			text: 'Delete',
		});
		deleteBtn.addEventListener('click', async () => {
			if (submitting) return;
			submitting = true;
			deleteBtn.disabled = true;
			deleteBtn.textContent = 'Deleting…';
			try {
				const csrf = await getCsrfToken();
				const headers = {};
				if (csrf) headers['x-csrf-token'] = csrf;
				await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/reviews`, {
					method: 'DELETE',
					credentials: 'include',
					headers,
				});
				onSuccess(null);
			} catch {
				deleteBtn.disabled = false;
				deleteBtn.textContent = 'Delete';
				submitting = false;
			}
		});
		actions.appendChild(deleteBtn);
	}
	actions.appendChild(submitBtn);

	return el('div', { class: 'ad-review-form' }, [
		formTitle,
		starPicker,
		textarea,
		el('div', { class: 'ad-review-form-footer' }, [
			el('div', { style: 'display:flex;gap:12px;align-items:center' }, [charCount, statusEl]),
			actions,
		]),
	]);
}

function buildReviewItem(r, agentId, onRefresh) {
	const avatar = reviewAvatarEl(r);
	const dateStr = fmtRelTime(r.created_at);

	const starsEl = el('div', {
		class: 'ad-review-item-stars',
		'aria-label': `${r.rating} out of 5 stars`,
	});
	starsEl.innerHTML = starsHtml(r.rating);

	const head = el('div', { class: 'ad-review-item-head' }, [
		avatar,
		el('div', { class: 'ad-review-meta' }, [
			el('div', { class: 'ad-review-author', text: r.author_name || 'Anonymous' }),
			el('div', { class: 'ad-review-date', text: dateStr }),
		]),
		starsEl,
	]);

	const children = [head];

	if (r.body) {
		children.push(el('div', { class: 'ad-review-body', text: r.body }));
	}

	if (r.is_mine) {
		const editBtn = el('button', { class: 'ad-review-mine-btn', type: 'button', text: 'Edit' });
		editBtn.addEventListener('click', () => {
			const form = buildReviewForm(agentId, r, onRefresh);
			item.replaceWith(form);
		});
		const delBtn = el('button', {
			class: 'ad-review-mine-btn danger',
			type: 'button',
			text: 'Delete',
		});
		delBtn.addEventListener('click', async () => {
			delBtn.disabled = true;
			delBtn.textContent = 'Deleting…';
			try {
				const csrf = await getCsrfToken();
				const headers = {};
				if (csrf) headers['x-csrf-token'] = csrf;
				await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/reviews`, {
					method: 'DELETE',
					credentials: 'include',
					headers,
				});
				onRefresh(null);
			} catch {
				delBtn.disabled = false;
				delBtn.textContent = 'Delete';
			}
		});
		children.push(el('div', { class: 'ad-review-mine-actions' }, [editBtn, delBtn]));
	}

	const item = el('div', { class: 'ad-review-item', role: 'article' }, children);
	return item;
}

// HTML-escape untrusted text before interpolating it into an innerHTML string.
// Covers the five significant characters so attacker-controlled values (URL
// params, on-chain metadata, API fields) can't break out into markup.
function escapeText(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function fmtRelTime(iso) {
	const t = new Date(iso).getTime();
	const sec = Math.floor((Date.now() - t) / 1000);
	if (sec < 60) return `${sec}s ago`;
	if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
	if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
	if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
	return new Date(iso).toLocaleDateString();
}

function actionIcon(type) {
	return (
		{
			speak: '💬',
			remember: '📝',
			sign: '✍️',
			'skill-done': '✓',
			validate: '✔',
			'load-end': '📦',
		}[type] || '•'
	);
}

function summarizeActionPayload(p) {
	if (typeof p !== 'object' || !p) return '';
	if (p.text) return String(p.text).slice(0, 90);
	if (p.content) return String(p.content).slice(0, 90);
	const k = Object.keys(p)[0];
	if (k == null) return '';
	const v = p[k];
	return typeof v === 'string' ? `${k}=${v.slice(0, 60)}` : `${k}=${typeof v}`;
}

function renderActions(actions, agentId) {
	const card = document.getElementById('ad-actions-card');
	const list = document.getElementById('ad-actions-list');
	document.getElementById('ad-actions-count').textContent = `${actions.length} recent`;
	list.innerHTML = '';
	for (const a of actions) {
		const verifyMark =
			a.verified === true
				? '<span class="ad-pill ad-pill-green" title="signature verified">✓</span>'
				: a.verified === false
					? '<span class="ad-pill" title="invalid signature">✗</span>'
					: '';
		const meta = el('span', {
			class: 'ad-muted',
			style: 'font-size:11px;display:flex;align-items:center;gap:6px',
		});
		if (verifyMark) {
			const m = document.createElement('span');
			m.innerHTML = verifyMark;
			meta.appendChild(m);
		}
		meta.appendChild(el('span', { text: fmtRelTime(a.timestamp) }));
		const row = el(
			'div',
			{
				class: 'ad-row ad-row-split',
				style: 'padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)',
			},
			[
				el('span', { style: 'display:flex;align-items:center;gap:8px;min-width:0' }, [
					el('span', { text: actionIcon(a.type) }),
					el('span', {
						class: 'ad-mono',
						style: 'min-width:90px;flex-shrink:0',
						text: a.type,
					}),
					el('span', {
						class: 'ad-muted',
						style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
						text: summarizeActionPayload(a.payload),
					}),
				]),
				meta,
			],
		);
		list.appendChild(row);
	}
	list.appendChild(
		el('div', { style: 'text-align:center;padding-top:10px' }, [
			el('a', {
				class: 'ad-cta',
				href: `/dashboard/account?agent=${encodeURIComponent(agentId)}`,
				text: 'See full action log →',
			}),
		]),
	);
	card.style.display = '';
}

function renderMemory(entries) {
	const card = document.getElementById('ad-memory-card');
	document.getElementById('ad-memory-count').textContent = `${entries.length}`;
	const list = document.getElementById('ad-memory-list');
	list.innerHTML = '';
	for (const m of entries) {
		const row = el(
			'div',
			{ style: 'padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)' },
			[
				el('div', {
					class: 'ad-muted',
					style: 'font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px',
					text: m.type || 'memory',
				}),
				el('div', {
					style: 'color:#ddd;font-size:13px;white-space:pre-wrap',
					text: String(m.content || '').slice(0, 240),
				}),
			],
		);
		list.appendChild(row);
	}
	card.style.display = '';
}

function renderStrategy(strategy) {
	const card = document.getElementById('ad-strategy-card');
	const pre = document.getElementById('ad-strategy');
	pre.textContent = typeof strategy === 'string' ? strategy : JSON.stringify(strategy, null, 2);
	card.style.display = '';
}

function renderReputation(r) {
	const card = document.getElementById('ad-reputation-card');
	document.getElementById('ad-rep-avg').textContent = r.average
		? Number(r.average).toFixed(2)
		: '0.00';
	document.getElementById('ad-rep-count').textContent = String(r.count || 0);
	if (r.total_stake_wei && r.total_stake_wei !== '0') {
		document.getElementById('ad-rep-stake-row').style.display = '';
		const wei = BigInt(r.total_stake_wei);
		const eth = Number(wei) / 1e18;
		document.getElementById('ad-rep-stake').textContent = `${eth.toFixed(4)} ETH`;
	}
	card.style.display = '';
}

const TIER_EMOJI_MAP = { prime: '🟣', strong: '🔵', lean: '🟡', watch: '⚪', avoid: '🔴' };

async function renderOracleTrackRecord(agentId) {
	const card = document.getElementById('ad-trading-card');
	if (!card || !agentId) return;
	let data;
	try {
		const r = await fetch(`/api/oracle/agent-stats?agent_id=${encodeURIComponent(agentId)}&limit=8`);
		if (!r.ok) return;
		data = await r.json();
	} catch { return; }

	const s = data.summary;
	if (!s || s.total === 0) return; // agent has no oracle actions — keep card hidden

	card.style.display = '';

	const allSim = (data.recent_actions || []).every((a) => a.mode === 'simulate');
	const modePill = document.getElementById('ad-trade-mode-pill');
	if (modePill && allSim) modePill.hidden = false;

	const winRateEl = document.getElementById('ad-trade-winrate');
	if (winRateEl) winRateEl.textContent = s.win_rate != null ? `${s.win_rate}%` : '—';

	const wlEl = document.getElementById('ad-trade-wl');
	if (wlEl) wlEl.textContent = `${s.wins}W / ${s.losses}L / ${s.open} open`;

	const pnlEl = document.getElementById('ad-trade-pnl');
	if (pnlEl) {
		const pnl = s.realized_pnl_sol;
		pnlEl.textContent = pnl != null ? `${pnl >= 0 ? '+' : ''}${Number(pnl).toFixed(4)} SOL` : '—';
		pnlEl.className = pnl > 0 ? 'ad-trade-pnl positive' : pnl < 0 ? 'ad-trade-pnl negative' : '';
	}

	const roiEl = document.getElementById('ad-trade-roi');
	if (roiEl) roiEl.textContent = s.roi_pct != null ? `${s.roi_pct >= 0 ? '+' : ''}${s.roi_pct}%` : '—';

	const histEl = document.getElementById('ad-trade-history');
	if (histEl) {
		histEl.innerHTML = '';
		for (const a of (data.recent_actions || [])) {
			const outcome = a.outcome || 'open';
			const tierE = TIER_EMOJI_MAP[a.tier] || '';
			const peak = a.peak_multiple != null ? `${Number(a.peak_multiple).toFixed(1)}×` : '';
			const pnlVal = a.realized_pnl_sol;
			const pnlText = pnlVal != null
				? `${pnlVal >= 0 ? '+' : ''}${Number(pnlVal).toFixed(3)} SOL`
				: '';
			const row = document.createElement('a');
			row.className = 'ad-trade-row';
			row.href = a.oracle_url || `https://three.ws/oracle?mint=${a.mint}`;
			row.target = '_blank';
			row.rel = 'noopener noreferrer';
			row.innerHTML = `<span class="ad-trade-outcome ${outcome}"></span><span class="ad-trade-symbol">$${(a.symbol || '?').toUpperCase()}</span><span class="ad-trade-tier">${tierE} ${a.tier || ''}</span><span class="ad-trade-peak">${peak}</span><span class="ad-trade-pnl ${pnlVal != null && pnlVal >= 0 ? 'positive' : pnlVal != null ? 'negative' : ''}">${pnlText}</span>`;
			histEl.appendChild(row);
		}
	}

	const copyLink = document.getElementById('ad-trade-copy-link');
	if (copyLink && s.wins > 0) {
		copyLink.href = `/trader/${encodeURIComponent(agentId)}`;
		copyLink.hidden = false;
	}
}

function renderEmbedPolicy(p) {
	if (!p || typeof p !== 'object') return;
	const card = document.getElementById('ad-embed-policy-card');
	const host = document.getElementById('ad-embed-policy');
	host.innerHTML = '';

	const allowEmbed = p.allow_embed === false ? 'No' : 'Yes';
	const allowedOrigins = Array.isArray(p.allowed_origins) ? p.allowed_origins : [];
	const monthlyQuota = p?.brain?.monthly_quota;

	// Respect the owner's embed policy: if embedding is turned off, hide the
	// snippet card (and keep enrichment from re-revealing it).
	const embedCard = document.getElementById('ad-embed-card');
	if (embedCard && p.allow_embed === false) {
		embedCard.dataset.embedDisabled = '1';
		embedCard.hidden = true;
	}

	host.appendChild(
		el('div', { class: 'ad-row ad-row-split' }, [
			el('span', { class: 'ad-muted', text: 'Embeddable' }),
			el('span', { text: allowEmbed }),
		]),
	);
	if (allowedOrigins.length) {
		host.appendChild(
			el('div', { class: 'ad-row ad-row-split' }, [
				el('span', { class: 'ad-muted', text: 'Allowed origins' }),
				el('span', {
					class: 'ad-mono',
					style: 'font-size:11px;text-align:right',
					text:
						allowedOrigins.slice(0, 3).join(', ') +
						(allowedOrigins.length > 3 ? ` +${allowedOrigins.length - 3}` : ''),
				}),
			]),
		);
	} else if (allowEmbed === 'Yes') {
		host.appendChild(
			el('div', { class: 'ad-row ad-row-split' }, [
				el('span', { class: 'ad-muted', text: 'Allowed origins' }),
				el('span', { text: 'any' }),
			]),
		);
	}
	if (monthlyQuota != null) {
		host.appendChild(
			el('div', { class: 'ad-row ad-row-split' }, [
				el('span', { class: 'ad-muted', text: 'Monthly LLM quota' }),
				el('span', { text: String(monthlyQuota) }),
			]),
		);
	}
	card.style.display = '';
}

const SOL_NAME_RE = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*(?:\.sol)?$/i;
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// In-flight resolution token — used by both the typeahead and the confirm
// handler so the latter doesn't fire while a lookup is still pending and so a
// stale typeahead response can't overwrite a newer one.
function makeSnsResolver(inputEl, statusEl) {
	let seq = 0;
	let lastInput = '';
	let lastResolved = null; // { name: 'foo.sol', address: 'BASE58' } | { name: null, address: 'raw' } | null
	let pending = null;

	function setStatus(kind, text) {
		statusEl.hidden = !text;
		statusEl.textContent = text || '';
		statusEl.className = `ad-resolved${kind ? ` ${kind}` : ''}`;
	}

	async function lookup(name) {
		const myId = ++seq;
		pending = (async () => {
			try {
				const r = await fetch(`/api/sns?name=${encodeURIComponent(name)}`, {
					credentials: 'include',
				});
				if (myId !== seq) return null; // superseded
				if (!r.ok) {
					const j = await r.json().catch(() => ({}));
					setStatus('warn', j?.error_description || `lookup failed (${r.status})`);
					lastResolved = null;
					return null;
				}
				const { data } = await r.json();
				if (myId !== seq) return null;
				// A miss is now a 200 with `resolved: false` / `address: null`, not a 404.
				if (!data?.address) {
					setStatus('warn', `${name} does not resolve`);
					lastResolved = null;
					return null;
				}
				setStatus('ok', `→ ${data.address}`);
				lastResolved = { name: data.name, address: data.address };
				return lastResolved;
			} catch (err) {
				if (myId === seq) setStatus('warn', err.message || 'lookup failed');
				return null;
			} finally {
				if (myId === seq) pending = null;
			}
		})();
		return pending;
	}

	function onInput() {
		const raw = inputEl.value.trim();
		if (raw === lastInput) return;
		lastInput = raw;
		seq++; // invalidate any in-flight lookup
		pending = null;
		lastResolved = null;

		if (!raw) {
			setStatus('', '');
			return;
		}
		if (SOL_ADDR_RE.test(raw)) {
			lastResolved = { name: null, address: raw };
			setStatus('', '');
			return;
		}
		if (/\.sol$/i.test(raw) || (SOL_NAME_RE.test(raw) && !SOL_ADDR_RE.test(raw))) {
			setStatus('loading', 'Resolving .sol…');
			// debounce briefly so we don't fire for every keystroke
			const myId = seq;
			setTimeout(() => {
				if (myId !== seq) return;
				lookup(raw);
			}, 300);
			return;
		}
		setStatus('warn', 'Not a valid Solana address or .sol name');
	}

	async function resolveForSubmit() {
		// If a lookup is in flight, wait for it.
		if (pending) await pending;
		const raw = inputEl.value.trim();
		if (!raw) return null;
		if (lastResolved?.address) return lastResolved.address;
		if (SOL_ADDR_RE.test(raw)) return raw;
		if (/\.sol$/i.test(raw) || SOL_NAME_RE.test(raw)) {
			const r = await lookup(raw);
			return r?.address || null;
		}
		return null;
	}

	function reset() {
		seq++;
		pending = null;
		lastInput = '';
		lastResolved = null;
		setStatus('', '');
	}

	inputEl.addEventListener('input', onInput);
	return { resolveForSubmit, reset };
}

function wireShareButton(agent) {
	const btn = document.getElementById('ad-share-btn');
	if (!btn) return;

	const origin = location.origin;
	const shareUrl = `${origin}/agents/${agent.id}`;
	const remixUrl = `${origin}/create`;

	btn.style.display = '';
	btn.addEventListener('click', () => {
		showSharePanel(
			{
				kind: 'agent',
				id: agent.id,
				title: agent.name || 'Agent',
				description: agent.description || '',
				shareUrl,
				remixUrl,
			},
			btn,
		);
	});
}

// ── Owner action bar (hero) + inline deploy slot (BLOCKCHAIN DETAILS) ────────

function mountOwnerBar(agent) {
	const bar = document.getElementById('ad-owner-bar');
	if (!bar) return;

	// Always reset so re-renders are idempotent.
	bar.innerHTML = '';
	bar.hidden = !agent.isOwner;
	if (!agent.isOwner) return;

	// Edit Agent
	const editLink = el('a', {
		class: 'ad-btn',
		href: `/agent-edit?id=${encodeURIComponent(agent.id)}`,
	});
	editLink.textContent = '✏ Edit Agent';
	bar.appendChild(editLink);

	// Dashboard link
	const dashLink = el('a', {
		class: 'ad-btn',
		href: '/dashboard-next/agents',
	});
	dashLink.textContent = 'Manage Agents';
	bar.appendChild(dashLink);

	// Deploy on-chain (only if not yet deployed)
	const alreadyDeployed = !!(
		(agent.rawMetadata?.onchain || agent.onchain)?.txHash
	);
	if (!alreadyDeployed) {
		const deployBtn = el('button', {
			class: 'ad-btn ad-btn-deploy',
			type: 'button',
		});
		deployBtn.textContent = '⬡ Deploy on-chain';
		deployBtn.addEventListener('click', () => openDeployModalFromDetail(agent));
		bar.appendChild(deployBtn);
	}

	// Mount inline OnchainDeployButton in BLOCKCHAIN DETAILS section.
	// This shows the success chip when deployed, or the full chain-select +
	// deploy button for owners who haven't deployed yet.
	mountDeploySlot(agent);
}

async function mountDeploySlot(agent) {
	const slot = document.getElementById('ad-deploy-slot');
	if (!slot) return;
	slot.innerHTML = '';
	if (!agent.isOwner) return;

	try {
		const [{ OnchainDeployButton }, ] = await Promise.all([
			import('./onchain/deploy-button.js'),
			import('./erc8004/deploy-button.css'),
		]);
		const deployAgentObj = {
			id: agent.id,
			name: agent.name || '',
			description: agent.description || '',
			avatar_id: agent.avatar_id || null,
			skills: Array.isArray(agent.skills) && agent.skills.length ? agent.skills : undefined,
			onchain: agent.onchain || agent.rawMetadata?.onchain || null,
		};
		const btn = new OnchainDeployButton({ agent: deployAgentObj, container: slot });
		btn.mount();

		// When deploy succeeds, hide the "Deploy on-chain" button in the owner bar
		// (the success chip in the slot replaces the call-to-action).
		const observer = new MutationObserver(() => {
			if (deployAgentObj.onchain?.txHash && slot.querySelector('.deploy-chip--success')) {
				observer.disconnect();
				const heroDeployBtn = document.querySelector('#ad-owner-bar .ad-btn-deploy');
				if (heroDeployBtn) heroDeployBtn.remove();
				// Refresh the status badge to show the on-chain badge.
				import('./shared/onchain-badge.js').then(({ onchainBadgeEl }) => {
					document.getElementById('ad-onchain-badge')?.remove();
					const badge = onchainBadgeEl({ onchain: deployAgentObj.onchain }, { size: 'md' });
					if (badge) {
						badge.id = 'ad-onchain-badge';
						document.getElementById('ad-status')?.insertAdjacentElement('afterend', badge);
					}
				}).catch(() => {});
			}
		});
		observer.observe(slot, { childList: true, subtree: true });
	} catch (err) {
		log.warn('[agent-detail] deploy slot failed:', err?.message);
	}
}

async function openDeployModalFromDetail(agent) {
	try {
		const [{ OnchainDeployButton }] = await Promise.all([
			import('./onchain/deploy-button.js'),
			import('./erc8004/deploy-button.css'),
		]);

		const overlay = document.createElement('div');
		overlay.style.cssText = `
			position:fixed;inset:0;z-index:1000;
			background:rgba(8,9,14,0.72);backdrop-filter:blur(6px);
			display:grid;place-items:center;padding:20px;
		`;
		overlay.innerHTML = `
			<div role="dialog" aria-modal="true" aria-label="Deploy agent on-chain" style="
				width:min(460px,100%);
				background:linear-gradient(180deg,rgba(22,24,32,0.97),rgba(16,17,24,0.97));
				border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:24px;
				box-shadow:0 20px 60px rgba(0,0,0,0.6);
			">
				<div style="font-size:17px;font-weight:600;margin-bottom:6px;color:#e7e9ee">Deploy on-chain</div>
				<div style="font-size:12.5px;color:rgba(231,233,238,0.5);margin-bottom:18px">
					Register <strong style="color:#e7e9ee">${escapeText(agent.name || 'this agent')}</strong> on-chain.
					Pick a chain, sign one transaction — the asset becomes the agent's permanent on-chain identity.
				</div>
				<div data-slot="deploy-host" style="display:flex;justify-content:center;margin-bottom:18px"></div>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button data-action="cancel" style="
						background:rgba(255,255,255,0.06);color:#e7e9ee;border:1px solid rgba(255,255,255,0.1);
						border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;font-family:inherit;
					">Close</button>
				</div>
			</div>
		`;
		document.body.appendChild(overlay);

		const deployHost = overlay.querySelector('[data-slot="deploy-host"]');
		const deployAgentObj = {
			id: agent.id,
			name: agent.name || '',
			description: agent.description || '',
			avatar_id: agent.avatar_id || null,
			skills: Array.isArray(agent.skills) && agent.skills.length ? agent.skills : undefined,
			onchain: agent.onchain || agent.rawMetadata?.onchain || null,
		};
		const deployBtn = new OnchainDeployButton({ agent: deployAgentObj, container: deployHost });
		deployBtn.mount();

		let deployed = false;
		const observer = new MutationObserver(() => {
			if (deployAgentObj.onchain?.txHash && deployHost.querySelector('.deploy-chip--success')) {
				deployed = true;
			}
		});
		observer.observe(deployHost, { childList: true, subtree: true });

		const close = () => {
			observer.disconnect();
			deployBtn.unmount();
			overlay.remove();
			document.removeEventListener('keydown', onKey);
			if (deployed) {
				// Refresh the owner bar so the deploy button disappears and the slot
				// shows the persistent success chip.
				agent.onchain = deployAgentObj.onchain;
				mountOwnerBar(agent);
			}
		};
		function onKey(e) { if (e.key === 'Escape') close(); }
		document.addEventListener('keydown', onKey);
		overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
		overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
	} catch (err) {
		log.warn('[agent-detail] deploy modal failed:', err?.message);
	}
}

function bindWalletActions(isOwner) {
	// Receive / Withdraw / Swap act on funds the viewer controls, not the agent's
	// on-chain wallet — there is no client-side key for the agent address. Showing
	// them under AGENT HOLDINGS on agents the viewer doesn't own misrepresents what
	// they do (it reads as "move the agent's SOL"). Server-side ownership is the
	// authoritative signal: /api/agents/:id only returns user_id to the owner, which
	// is what `isOwner` reflects. Hide the actions for everyone else; the balance and
	// address above stay visible as read-only info.
	const actions = document.getElementById('ad-holdings-actions');
	if (!isOwner) {
		if (actions) actions.style.display = 'none';
		return;
	}

	const receiveBtn = document.getElementById('receive-btn');
	const withdrawBtn = document.getElementById('withdraw-btn');
	const swapBtn = document.getElementById('swap-btn');
	const qrCodeContainer = document.getElementById('qr-code-container');
	const qrCodeCanvas = document.getElementById('qr-code');
	const walletAddressSpan = document.getElementById('ad-holdings-addr');

	receiveBtn.addEventListener('click', () => {
		const walletAddress = walletAddressSpan.dataset.full;
		if (walletAddress) {
			qrCodeContainer.classList.toggle('hidden');
			if (!qrCodeContainer.classList.contains('hidden')) {
				new QRious({
					element: qrCodeCanvas,
					value: walletAddress,
					size: 160,
				});
			}
		}
	});

	// Build the withdraw modal using the shared Modal primitive
	const bodyEl = document.createElement('div');
	bodyEl.innerHTML = `
		<div class="ad-form-group">
			<label for="withdraw-amount">Amount (SOL)</label>
			<input type="number" id="withdraw-amount" class="ad-input" placeholder="0.0">
		</div>
		<div class="ad-form-group">
			<label for="recipient-address">Recipient address or .sol name</label>
			<input type="text" id="recipient-address" class="ad-input"
				placeholder="Wallet address or yourname.sol" autocomplete="off" spellcheck="false">
			<div id="recipient-resolved" class="ad-resolved" hidden></div>
		</div>
	`;

	const actionsEl = document.createElement('div');
	actionsEl.innerHTML = `
		<button id="cancel-withdraw-btn" class="ad-btn" type="button">Cancel</button>
		<button id="confirm-withdraw-btn" class="ad-btn ad-btn-primary" type="button">Confirm Withdraw</button>
	`;

	const withdrawModal = new Modal({
		title: 'Withdraw SOL',
		body: bodyEl,
		actions: actionsEl,
	});

	const withdrawAmountInput = withdrawModal.bodyEl.querySelector('#withdraw-amount');
	const recipientAddressInput = withdrawModal.bodyEl.querySelector('#recipient-address');
	const recipientResolvedEl = withdrawModal.bodyEl.querySelector('#recipient-resolved');
	const cancelWithdrawBtn = withdrawModal.actionsEl.querySelector('#cancel-withdraw-btn');
	const confirmWithdrawBtn = withdrawModal.actionsEl.querySelector('#confirm-withdraw-btn');
	const snsResolver = makeSnsResolver(recipientAddressInput, recipientResolvedEl);

	withdrawBtn.addEventListener('click', () => {
		withdrawModal.open(withdrawBtn);
	});

	cancelWithdrawBtn.addEventListener('click', () => {
		withdrawModal.close();
	});

	confirmWithdrawBtn.addEventListener('click', async () => {
		if (!wallet) {
			alert('Please connect your wallet first.');
			return;
		}

		const amount = parseFloat(withdrawAmountInput.value);
		const typedRecipient = recipientAddressInput.value.trim();

		if (isNaN(amount) || amount <= 0) {
			alert('Please enter a valid amount.');
			return;
		}

		if (!typedRecipient) {
			alert('Please enter a recipient address.');
			return;
		}

		confirmWithdrawBtn.disabled = true;
		try {
			const recipientAddress = await snsResolver.resolveForSubmit();
			if (!recipientAddress) {
				alert(`Could not resolve "${typedRecipient}" to a Solana address.`);
				return;
			}

			const recipientPubKey = new solanaWeb3.PublicKey(recipientAddress);
			const transaction = new solanaWeb3.Transaction().add(
				solanaWeb3.SystemProgram.transfer({
					fromPubkey: wallet,
					toPubkey: recipientPubKey,
					lamports: amount * solanaWeb3.LAMPORTS_PER_SOL,
				}),
			);

			transaction.feePayer = wallet;
			const { blockhash } = await connection.getRecentBlockhash();
			transaction.recentBlockhash = blockhash;

			const provider = getProvider();
			const signedTransaction = await provider.signTransaction(transaction);
			const signature = await connection.sendRawTransaction(signedTransaction.serialize());
			await connection.confirmTransaction(signature);

			const displayTarget =
				typedRecipient === recipientAddress
					? recipientAddress
					: `${typedRecipient} (${recipientAddress})`;
			alert(`Withdrawal of ${amount} SOL to ${displayTarget} successful!`);

			withdrawModal.close();
			withdrawAmountInput.value = '';
			recipientAddressInput.value = '';
			snsResolver.reset();
		} catch (error) {
			log.error('Withdrawal failed:', error);
			alert(`Withdrawal failed: ${error.message}`);
		} finally {
			confirmWithdrawBtn.disabled = false;
		}
	});

	swapBtn.addEventListener('click', () => {
		openSwapModal({ wallet, getProvider });
	});
}

function renderNotFound(id, reason) {
	document.title = 'Agent not found — three.ws';
	const main = document.querySelector('.ad-main');
	main.innerHTML = `
		<div style="padding:60px 24px;text-align:center;">
			<h1 style="margin:0 0 8px;font-size:22px;font-weight:600;">Agent not found</h1>
			<p style="color:rgba(231,233,238,0.55);font-size:14px;margin:0 0 22px;">
				${escapeText(reason || 'No agent registered with id')} <code style="font-family:ui-monospace,monospace;color:#e7e9ee;">${escapeText(id || '(none)')}</code>.
			</p>
			<a class="ad-cta" style="display:inline-block;padding:10px 22px;" href="/agents">← Back to Registry</a>
		</div>
	`;
}

/**
 * Transient load failure (offline, 5xx) — distinct from a genuine 404. Shows the
 * shared retryable error shell so a network blip never leaves a blank page.
 */
function renderLoadError(err) {
	document.title = 'Couldn’t load agent — three.ws';
	const main = document.querySelector('.ad-main');
	if (!main) return;
	main.innerHTML = '<div class="ad-load-error"></div>';
	renderAsyncError(
		main.querySelector('.ad-load-error'),
		err,
		{
			error: {
				title: 'Couldn’t load this agent',
				body: 'We hit a problem reaching the registry. Check your connection and try again.',
			},
			context: 'agent-detail:load',
		},
		runLoad,
	);
}

document.addEventListener('click', (e) => {
	const btn = e.target.closest('.ad-copy[data-copy-target]');
	if (!btn) return;
	const id = btn.getAttribute('data-copy-target');
	const node = document.getElementById(id);
	const value = node?.dataset?.full || node?.textContent || '';
	if (value && value !== '—') navigator.clipboard?.writeText(value)?.catch(() => {});
});

async function fetchJson(url) {
	const res = await fetch(url, { credentials: 'include' });
	if (!res.ok) {
		const err = new Error(`${url} → HTTP ${res.status}`);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

/**
 * Inflate the /api/agents/:id record into the detail-page shape.
 * `meta.onchain`, `rec.token`, and `rec.payments` are surfaced when present.
 */
function normalize(rec, avatar) {
	const meta = rec.meta || {};
	const onchain = rec.onchain || meta.onchain || {};

	const trust = [];
	if (rec.payments || rec.is_registered) trust.push('Reputation');
	if (rec.token) trust.push('Crypto-Economic');

	const services = [];
	if (rec.home_url) {
		services.push({
			type: 'web',
			url: new URL(rec.home_url, location.origin).href,
		});
	}
	if (rec.skills?.length) {
		services.push({
			type: 'a2a',
			version: meta.a2a_version || '0.3.0',
			url: `${location.origin}/agent/${rec.id}`,
			skills: rec.skills
				.map((s) => (typeof s === 'string' ? s : s.name || s.id))
				.filter(Boolean),
			domains: meta.domains || undefined,
		});
	}
	if (rec.token?.mint) {
		services.push({
			type: 'token',
			label: rec.token.symbol || rec.token.name,
			url: `https://birdeye.so/token/${rec.token.mint}?chain=solana`,
		});
		services.push({
			type: 'chart',
			url: `https://dexscreener.com/solana/${rec.token.mint}`,
		});
	}

	const protocols = [];
	if (rec.home_url) protocols.push('WEB');
	if (rec.skills?.length) protocols.push(`A2A ${meta.a2a_version || '0.3.0'}`);
	if (rec.token?.symbol) protocols.push(`TOKEN ${rec.token.symbol}`);
	if (onchain?.chain_id || rec.chain_id)
		protocols.push(`CHAIN ${onchain?.chain_id ?? rec.chain_id}`);

	const wallet = rec.wallet_address || onchain.wallet || meta.solana_wallet || '';

	const explorerUrl =
		(rec.token?.mint && `https://solscan.io/token/${rec.token.mint}`) ||
		(wallet && `https://solscan.io/account/${wallet}`) ||
		'#';

	const registries = [];
	if (rec.erc8004_registry) {
		registries.push(`ERC-8004 #${rec.erc8004_agent_id ?? '?'}`);
	}
	if (rec.is_registered) registries.push('three.ws');

	return {
		id: rec.id,
		avatar_id: rec.avatar_id || avatar?.id || null,
		name: rec.name || 'Unnamed agent',
		assetKind: rec.is_registered ? 'Core Asset' : 'Off-chain',
		// "Active" is a liveness signal, NOT an on-chain one. An agent is live as
		// long as it isn't an unpublished draft — off-chain agents are fully usable
		// and must not read as dead. On-chain status is carried separately by the
		// asset-kind label + the on-chain badge. `is_published` is only present in
		// the owner view; public viewers (undefined) always see a live agent.
		active: rec.is_published !== false,
		avatar: avatar?.image_url || avatar?.thumbnail_url || avatar?.preview_url || null,
		description: rec.description || '',
		trust,
		wallet,
		owner: rec.user_id || onchain.owner || '',
		authority: onchain.authority || rec.erc8004_registry || '',
		solBalance: meta.sol_balance ?? 0,
		creatorRewards: meta.creator_rewards ?? 0,
		x402: !!rec.payments?.accepted_tokens?.length,
		registries,
		protocols,
		explorerUrl,
		tradeUrl: rec.token?.mint ? `https://magiceden.io/marketplace/${rec.token.mint}` : '#',
		token: rec.token || null,
		services,
		// The /api/agents/:id endpoint only includes `user_id` in the response when
		// the requester is the owner — see api/agents.js decorate(row, isOwner).
		isOwner: !!rec.user_id,
		// On-chain ERC-8004 identifiers for the validation attestation badge.
		// Owner responses carry chain_id / erc8004_agent_id directly; public
		// responses carry them through the canonical `onchain` block (caip2 chain +
		// onchain_id). Resolved for EVM agents only — Solana token agents have no
		// ValidationRegistry record, so the badge is correctly skipped for them.
		...erc8004Ids(rec, onchain),
		glbUrl: rec.avatar_glb_url || onchain?.body_uri || meta.glb_url || null,
		rawMetadata: rec,
	};
}

/** Resolve { chainId, erc8004AgentId } from owner or public on-chain fields (EVM only). */
function erc8004Ids(rec, onchain) {
	const caip2Match = /^eip155:(\d+)$/.exec(String(onchain?.chain || ''));
	const isEvm = onchain
		? onchain.family === 'evm' || !!caip2Match
		: rec.chain_id != null && rec.erc8004_agent_id != null;
	if (!isEvm) return { chainId: null, erc8004AgentId: null };

	const chainId = Number(rec.chain_id ?? onchain?.chain_id ?? caip2Match?.[1]) || null;
	const agentId =
		rec.erc8004_agent_id != null
			? String(rec.erc8004_agent_id)
			: onchain?.onchain_id != null
				? String(onchain.onchain_id)
				: null;
	return { chainId, erc8004AgentId: agentId };
}

// Agents and avatars live in separate tables with separate UUIDs — an agent
// merely references an avatar via avatar_id. So an id that 404s as an agent may
// actually be an avatar shared (or old-linked) as /agents/:id. Probe the avatar
// store; if it resolves, the caller redirects to the avatar page instead of
// showing a dead "not found".
async function resolveAsAvatar(id) {
	try {
		const json = await fetchJson(`/api/avatars/${encodeURIComponent(id)}`);
		return !!(json && json.avatar);
	} catch {
		return false;
	}
}

async function loadAgent(id) {
	if (!id) return { error: 'missing id', agent: null, notFound: true };
	if (!UUID_RE.test(id))
		return { error: 'invalid id (expected UUID)', agent: null, notFound: true };

	let rec;
	try {
		const json = await fetchJson(`/api/agents/${encodeURIComponent(id)}`);
		rec = json.agent;
	} catch (e) {
		// A 404 is genuinely "no such agent"; anything else (offline, 5xx) is a
		// transient load failure the user should be able to retry.
		const notFound = e.status === 404;
		if (notFound && (await resolveAsAvatar(id))) {
			location.replace(`/avatars/${encodeURIComponent(id)}`);
			return { agent: null, error: null, redirecting: true };
		}
		return {
			error: notFound ? 'No agent with id' : e,
			agent: null,
			notFound,
		};
	}
	if (!rec) {
		if (await resolveAsAvatar(id)) {
			location.replace(`/avatars/${encodeURIComponent(id)}`);
			return { agent: null, error: null, redirecting: true };
		}
		return { error: 'No agent with id', agent: null, notFound: true };
	}

	let avatar = null;
	if (rec.avatar_id) {
		try {
			const json = await fetchJson(`/api/avatars/${encodeURIComponent(rec.avatar_id)}`);
			avatar = json.avatar || null;
		} catch (e) {
			log.warn('[agent-detail] avatar fetch failed:', e.message);
		}
	}

	return { agent: normalize(rec, avatar), error: null };
}

// --- Wallet Integration ---

const getProvider = () => {
	if ('phantom' in window) {
		const provider = window.phantom?.solana;
		if (provider?.isPhantom) {
			return provider;
		}
	}
	window.open('https://phantom.app/', '_blank');
	return null;
};

let wallet = null;
// Route through our same-origin proxy. Public devnet RPC is also rate-limited
// from browsers; the proxy keeps both clusters consistent.
const _rpcOrigin = window.location?.origin || 'https://three.ws';
const connection = new solanaWeb3.Connection(
	`${_rpcOrigin}/api/solana-rpc?net=devnet`,
	'confirmed',
);
const connectWalletBtn = document.getElementById('connect-wallet-btn');

connectWalletBtn.addEventListener('click', async () => {
	const provider = getProvider();
	if (provider) {
		try {
			const resp = await provider.connect();
			wallet = resp.publicKey;

			connectWalletBtn.textContent = `${wallet.toString().slice(0, 4)}...${wallet.toString().slice(-4)}`;
		} catch (err) {
			log.error('Failed to connect to wallet:', err);
		}
	}
});

const id =
	new URLSearchParams(location.search).get('id') ||
	location.pathname.match(/\/agents\/([^/]+)/)?.[1];

function runLoad() {
	loadAgent(id)
		.then(({ agent, error, notFound, redirecting }) => {
			if (redirecting) return;
			if (agent) { render(agent); renderOracleTrackRecord(agent.id); return; }
			if (notFound) return renderNotFound(id, typeof error === 'string' ? error : '');
			renderLoadError(error);
		})
		.catch((e) => {
			renderLoadError(e);
		});
}
runLoad();
