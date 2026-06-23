/**
 * GET /api/og/agent?id=<agentId>
 *
 * Dynamic OG image — the agent's wallet as a screenshot-worthy TRADING CARD.
 * SVG 1200×630, rendered entirely from REAL data so a shared agent link unfurls
 * with a card that matches the on-page one (src/shared/wallet-card.js):
 *
 *   - avatar portrait (or gradient-initial fallback)
 *   - agent name + vanity-highlighted custodial Solana address
 *   - live net worth (USD, from the same priced-balance path the wallet uses)
 *   - holdings count, realized P&L (when positive), lifetime tips
 *   - reputation tier badge (new…elite) + $THREE-holder mark
 *   - a "rarity finish" (Common…Mythic) that scales with the agent's REAL wealth
 *     and reputation tier — matte for a dormant new wallet, holo for a luminous one
 *
 * Every enrichment is best-effort and individually timeout-guarded: a slow or
 * failed chain/reputation read degrades that one field (a "—" balance, no badge),
 * never a broken unfurl. Private avatars never render a card (visibility re-checked
 * server-side). Public/unlisted only. Cached sensibly.
 */

import { cors, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { env } from '../_lib/env.js';
import { isUuid } from '../_lib/validate.js';
import { getBalances, walletUsdTotal } from '../_lib/balances.js';
import { getAgentReputation } from '../_lib/trust/wallet-reputation.js';
import { tierForUsd, NETWORTH_TIERS, THREE_MINT } from '../../src/shared/wallet-networth.js';

const CACHE = 'public, max-age=180, s-maxage=900, stale-while-revalidate=120';

// Reputation tier → rank (0..4). Kept in sync with REP_RANK in wallet-card.js and
// TIERS in agent-financial-reputation.js so the finish matches on page and image.
const REP_RANK = { new: 0, emerging: 1, established: 2, trusted: 3, elite: 4 };
const FINISH_LABELS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

const GRADIENTS = [
	['#6366f1', '#8b5cf6'], ['#06b6d4', '#6366f1'], ['#10b981', '#06b6d4'], ['#f59e0b', '#ef4444'],
	['#ec4899', '#8b5cf6'], ['#14b8a6', '#3b82f6'], ['#f97316', '#ec4899'], ['#8b5cf6', '#06b6d4'],
];
function gradientForName(name) {
	const idx = (name || '').charCodeAt(0) % GRADIENTS.length;
	return GRADIENTS[idx] || GRADIENTS[0];
}

function x(s) {
	return String(s || '')
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function trunc(s, n) {
	s = String(s || '');
	return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// Race a best-effort enrichment against a deadline so one slow read never blocks
// the unfurl. Resolves to `fallback` on timeout or any error.
function withTimeout(promise, ms, fallback) {
	return Promise.race([
		Promise.resolve(promise).catch(() => fallback),
		new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
	]);
}

// Compact USD, matching src/shared/wallet-format.formatWalletUsd so the image
// number reads identically to the on-page card.
function fmtUsd(n) {
	if (n == null || !Number.isFinite(n)) return null;
	if (n <= 0) return '$0';
	if (n < 0.01) return '<$0.01';
	if (n < 10) return `$${n.toFixed(2)}`;
	if (n < 1000) return `$${Math.round(n)}`;
	if (n < 1e6) return `$${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
	if (n < 1e9) return `$${(n / 1e6).toFixed(1)}M`;
	return `$${(n / 1e9).toFixed(1)}B`;
}

async function realizedPnlFor(id) {
	try {
		const [r] = await sql`
			SELECT COALESCE(sum(realized_pnl_lamports), 0)::float8 AS lamports,
			       count(*) FILTER (WHERE realized_pnl_lamports > 0)::int AS wins
			FROM agent_sniper_positions
			WHERE agent_id = ${id} AND status = 'closed' AND realized_pnl_lamports IS NOT NULL
		`;
		return { sol: (Number(r?.lamports) || 0) / 1e9, wins: r?.wins || 0 };
	} catch {
		return { sol: 0, wins: 0 };
	}
}

async function tipsCountFor(id) {
	try {
		const [agg] = await sql`
			SELECT COUNT(*)::int AS n
			FROM agent_custody_events
			WHERE agent_id = ${id} AND event_type = 'tip' AND status = 'confirmed'
		`;
		return agg?.n ?? 0;
	} catch {
		return 0;
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const id = (url.searchParams.get('id') || '').trim();

	if (!isUuid(id)) return fallback(res);

	let row;
	try {
		[row] = await sql`
			select i.name, i.description, i.chain_id, i.erc8004_agent_id, i.meta,
			       a.thumbnail_key, a.storage_key, a.visibility
			from agent_identities i
			left join avatars a on a.id = i.avatar_id and a.deleted_at is null
			where i.id = ${id} and i.deleted_at is null
			limit 1
		`;
	} catch {
		return fallback(res);
	}

	if (!row) return fallback(res);
	// Respect visibility — a private agent must never render a public card.
	if (row.visibility === 'private') return fallback(res);

	const name = trunc(row.name || 'Agent', 30);

	const solAddress = typeof row.meta?.solana_address === 'string' ? row.meta.solana_address : null;
	const vanPrefix = row.meta?.solana_vanity_prefix || null;
	const vanSuffix = row.meta?.solana_vanity_suffix || null;
	const realPrefix = vanPrefix && solAddress?.startsWith(vanPrefix) ? vanPrefix : '';
	const realSuffix = vanSuffix && solAddress?.endsWith(vanSuffix) ? vanSuffix : '';
	const isVanity = Boolean(realPrefix || realSuffix);
	const addrShort = solAddress
		? `${realPrefix || solAddress.slice(0, 4)}…${realSuffix || solAddress.slice(-4)}`
		: null;

	// ── Real enrichments, each timeout-guarded so the card always renders ──────
	const [balances, rep, pnl, tipsCount] = await Promise.all([
		solAddress ? withTimeout(getBalances({ chain: 'solana', address: solAddress }), 3000, null) : null,
		withTimeout(getAgentReputation(id, { lite: true }), 3000, null),
		withTimeout(realizedPnlFor(id), 2000, { sol: 0, wins: 0 }),
		solAddress ? withTimeout(tipsCountFor(id), 1500, 0) : 0,
	]);

	const usd = balances ? walletUsdTotal(balances) : 0;
	const tokens = balances?.tokens || [];
	const tokenCount = tokens.length;
	const hasThree = tokens.some((t) => t.mint === THREE_MINT && (t.amount || 0) > 0);
	const usdLabel = balances ? (fmtUsd(usd) ?? '$0') : '—';

	const wealthTier = tierForUsd(usd);
	const repRank = rep?.tier ? (REP_RANK[rep.tier] ?? 0) : 0;
	const finishLevel = Math.max(
		0,
		Math.min(5, Math.max(wealthTier.level, rep?.tier && repRank > 0 ? repRank + 1 : 0)),
	);
	const finishLabel = FINISH_LABELS[finishLevel];
	const rim = rep?.accent || '#c4b5fd';
	const holoOpacity = [0, 0, 0.12, 0.2, 0.3, 0.42][finishLevel];

	const repLabel = rep?.tierLabel || null;
	const repScore = rep && Number.isFinite(Number(rep.score)) ? Math.round(Number(rep.score)) : null;

	const [c1, c2] = gradientForName(row.name);
	const initial = (row.name || 'A')[0].toUpperCase();

	// Avatar embed (public/unlisted only) — same path as before.
	let avatarData = null;
	const CDN_BASE = env.S3_PUBLIC_DOMAIN || 'https://three.ws/cdn';
	const thumbPublic = row.visibility === 'public' || row.visibility === 'unlisted';
	if (row.thumbnail_key && thumbPublic) {
		try {
			const imgResp = await fetch(`${CDN_BASE}/${row.thumbnail_key}`, { signal: AbortSignal.timeout(3000) });
			if (imgResp.ok) {
				const MAX = 2 * 1024 * 1024;
				const declared = Number(imgResp.headers.get('content-length') || 0);
				if (!declared || declared <= MAX) {
					const ct = imgResp.headers.get('content-type') || 'image/jpeg';
					const ab = await imgResp.arrayBuffer();
					if (ab.byteLength <= MAX) avatarData = { ct, b64: Buffer.from(ab).toString('base64') };
				}
			}
		} catch { /* gradient fallback */ }
	}

	const AV_CX = 215, AV_CY = 300, AV_R = 150;

	// Build the right-column stat chips from real, public-safe aggregates.
	const stats = [];
	stats.push({ label: 'HOLDINGS', val: tokenCount === 0 ? '—' : String(tokenCount), accent: false });
	if (pnl.sol > 0) stats.push({ label: 'REALIZED P&L', val: `+${pnl.sol.toFixed(pnl.sol < 1 ? 3 : 2)} ◎`, accent: true });
	else if (tipsCount > 0) stats.push({ label: 'TIPS', val: String(tipsCount), accent: false });
	else stats.push({ label: 'WEALTH TIER', val: wealthTier.label, accent: false });
	if (repScore != null) stats.push({ label: 'REPUTATION', val: `${repScore}`, accent: false });
	else stats.push({ label: 'STATUS', val: balances ? 'Live' : 'New', accent: false });

	const STAT_X = 440, STAT_Y = 470, STAT_W = 232, STAT_GAP = 12;
	const statsSvg = stats.slice(0, 3).map((s, i) => {
		const sx = STAT_X + i * (STAT_W + STAT_GAP);
		const fill = s.accent ? 'rgba(74,222,128,.1)' : 'rgba(255,255,255,.04)';
		const stroke = s.accent ? 'rgba(74,222,128,.3)' : 'rgba(255,255,255,.08)';
		const valFill = s.accent ? '#86efac' : '#ece9f8';
		return `<rect x="${sx}" y="${STAT_Y}" width="${STAT_W}" height="72" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
			<text x="${sx + 18}" y="${STAT_Y + 34}" font-family="Inter,system-ui,sans-serif" font-size="26" font-weight="800" fill="${valFill}">${x(s.val)}</text>
			<text x="${sx + 18}" y="${STAT_Y + 56}" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing=".1em" fill="#6f6889">${x(s.label)}</text>`;
	}).join('\n');

	// Badge row (reputation tier + $THREE mark), placed under the name.
	const badges = [];
	if (repLabel) badges.push({ text: repLabel.toUpperCase(), color: rim, bg: true });
	if (hasThree) badges.push({ text: '◆ $THREE', color: '#fbbf24', bg: true });
	let badgeX = 440;
	const badgesSvg = badges.map((b) => {
		const w = 26 + b.text.length * 9.4;
		const seg = `<rect x="${badgeX}" y="208" width="${w}" height="30" rx="15" fill="${b.color}22" stroke="${b.color}66" stroke-width="1"/>
			<text x="${badgeX + 14}" y="228" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="800" letter-spacing=".06em" fill="${b.color}">${x(b.text)}</text>`;
		badgeX += w + 10;
		return seg;
	}).join('\n');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
		width="1200" height="630" viewBox="0 0 1200 630">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#0b0a11"/>
			<stop offset="1" stop-color="#06060a"/>
		</linearGradient>
		<radialGradient id="rimGlow" cx="20%" cy="0%" r="80%">
			<stop offset="0" stop-color="${x(rim)}" stop-opacity=".22"/>
			<stop offset="1" stop-color="${x(rim)}" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="avGlow" cx="50%" cy="50%" r="50%">
			<stop offset="0" stop-color="${x(c1)}" stop-opacity=".4"/>
			<stop offset="1" stop-color="${x(c1)}" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="avGrad" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${x(c1)}"/><stop offset="1" stop-color="${x(c2)}"/>
		</linearGradient>
		<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0.30" stop-color="#7c6cb0" stop-opacity="0"/>
			<stop offset="0.45" stop-color="#7c6cb0" stop-opacity="1"/>
			<stop offset="0.52" stop-color="#60a5fa" stop-opacity="1"/>
			<stop offset="0.60" stop-color="#ec72b6" stop-opacity="1"/>
			<stop offset="0.72" stop-color="#ec72b6" stop-opacity="0"/>
		</linearGradient>
		${avatarData ? `<clipPath id="avClip"><circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}"/></clipPath>` : ''}
	</defs>

	<rect width="1200" height="630" fill="url(#bg)"/>
	<rect width="1200" height="630" fill="url(#rimGlow)"/>
	${holoOpacity > 0 ? `<rect width="1200" height="630" fill="url(#holo)" opacity="${holoOpacity}"/>` : ''}
	<rect x="8" y="8" width="1184" height="614" rx="22" fill="none" stroke="${x(rim)}" stroke-width="2" opacity=".4"/>

	<!-- avatar -->
	<ellipse cx="${AV_CX}" cy="${AV_CY}" rx="210" ry="210" fill="url(#avGlow)" opacity=".7"/>
	${avatarData
		? `<image href="data:${avatarData.ct};base64,${avatarData.b64}" x="${AV_CX - AV_R}" y="${AV_CY - AV_R}" width="${AV_R * 2}" height="${AV_R * 2}" clip-path="url(#avClip)" preserveAspectRatio="xMidYMid slice"/>`
		: `<circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}" fill="url(#avGrad)" opacity=".9"/>
		   <text x="${AV_CX}" y="${AV_CY + 20}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="104" font-weight="800" fill="rgba(255,255,255,.92)">${x(initial)}</text>`}
	<circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}" fill="none" stroke="${x(rim)}" stroke-width="2.5" opacity=".55"/>

	<!-- top bar -->
	<text x="440" y="40" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="700" letter-spacing=".14em" fill="#5b5470">THREE.WS · WALLET CARD</text>
	<rect x="1010" y="22" width="166" height="30" rx="15" fill="${x(rim)}1c" stroke="${x(rim)}55" stroke-width="1"/>
	<text x="1093" y="42" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="800" letter-spacing=".14em" fill="${x(rim)}">${x(finishLabel.toUpperCase())}</text>
	<line x1="440" y1="58" x2="1176" y2="58" stroke="#211d2e" stroke-width="1"/>

	<!-- name -->
	<text x="440" y="128" font-family="Inter,system-ui,sans-serif" font-size="${name.length > 18 ? 46 : 56}" font-weight="800" fill="#f5f3ff">${x(name)}</text>

	<!-- vanity address -->
	${addrShort ? `
	<text x="440" y="176" font-family="ui-monospace,'JetBrains Mono',Menlo,monospace" font-size="28" font-weight="700" fill="${isVanity ? '#e9d5ff' : '#a8a0c4'}">${isVanity ? '✦ ' : ''}${x(addrShort)}</text>
	` : `<text x="440" y="176" font-family="Inter,system-ui,sans-serif" font-size="20" fill="#6b6485">Wallet provisioning…</text>`}

	<!-- badges -->
	${badgesSvg}

	<!-- net worth hero -->
	<text x="440" y="360" font-family="Inter,system-ui,sans-serif" font-size="84" font-weight="800" letter-spacing="-.02em" fill="#ffffff">${x(usdLabel)}</text>
	<text x="440" y="404" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="700" letter-spacing=".12em" fill="#7c7596">${x(wealthTier.label.toUpperCase())} · NET WORTH</text>

	<!-- stat chips -->
	${statsSvg}

	<!-- footer -->
	<rect x="0" y="588" width="1200" height="42" fill="#040408"/>
	<text x="440" y="615" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="600" fill="#5b5470">Tip it · Fork it · own its wallet</text>
	<text x="1176" y="615" font-family="Inter,system-ui,sans-serif" font-size="13" fill="#5b5470" text-anchor="end">three.ws/agent/${x(id)}</text>
</svg>`;

	res.statusCode = 200;
	res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
	res.setHeader('cache-control', CACHE);
	res.end(svg);
});

function fallback(res) {
	res.statusCode = 302;
	res.setHeader('location', 'https://three.ws/og-image.png');
	res.setHeader('cache-control', 'no-cache');
	res.end();
}
