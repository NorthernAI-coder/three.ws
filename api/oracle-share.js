/**
 * SSR share page for Oracle conviction signals
 * ---------------------------------------------
 * GET /api/oracle-share?mint=<mint>
 *
 * Wired via vercel.json: /oracle/coin/<mint> → /api/oracle-share?mint=$1
 *
 * Bakes Open Graph + Twitter Card + Farcaster Frame meta into <head> so social
 * crawlers (X/Twitter, Telegram, Discord, Slack, iMessage, WhatsApp, LinkedIn)
 * render a rich conviction-score preview. Real browsers are JS-redirected to
 * /oracle?mint=<mint> for the full interactive drawer.
 *
 * OG image: /api/oracle/og?mint=<mint> (SVG conviction card with score,
 * tier, pillar bars, smart-wallet count).
 */

import { sql } from './_lib/db.js';
import { cors, wrap } from './_lib/http.js';
import { env } from './_lib/env.js';

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;

	const url    = new URL(req.url, 'http://x');
	const mint   = (url.searchParams.get('mint') || '').trim();
	const origin = env.APP_ORIGIN || 'https://three.ws';

	if (!MINT_RE.test(mint)) return redirect(res, `${origin}/oracle`);

	let row;
	try {
		[row] = await sql`
			select symbol, name, image_uri, score, tier,
			       pedigree, structure, narrative, momentum,
			       smart_wallet_count, category, scored_at
			from oracle_conviction
			where mint = ${mint} and network = 'mainnet'
			limit 1
		`;
	} catch {
		return redirect(res, `${origin}/oracle?mint=${encodeURIComponent(mint)}`);
	}

	if (!row) return redirect(res, `${origin}/oracle?mint=${encodeURIComponent(mint)}`);

	const sym      = row.symbol ? `$${row.symbol}` : shortMint(mint);
	const name     = row.name   || sym;
	const score    = Number(row.score ?? 0);
	const tier     = row.tier   || 'unscored';
	const tierUp   = tier.charAt(0).toUpperCase() + tier.slice(1);
	const cat      = row.category || '';
	const swCount  = Number(row.smart_wallet_count || 0);

	const title = `${sym} — ${score}/100 ${tierUp} conviction · Oracle · three.ws`;
	const desc  = buildDesc({ sym, name, score, tier, cat, swCount,
		pedigree:  Number(row.pedigree  || 0),
		structure: Number(row.structure || 0),
		narrative: Number(row.narrative || 0),
		momentum:  Number(row.momentum  || 0),
	});

	const pageUrl  = `${origin}/oracle/coin/${mint}`;
	const deepUrl  = `${origin}/oracle?mint=${encodeURIComponent(mint)}`;
	const ogImage  = `${origin}/api/oracle/og?mint=${encodeURIComponent(mint)}`;

	res.statusCode = 200;
	res.setHeader('content-type', 'text/html; charset=utf-8');
	res.setHeader('cache-control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
	res.end(renderHtml({ title, desc, pageUrl, deepUrl, ogImage, sym, score, tier, origin }));
});

function redirect(res, to) {
	res.statusCode = 302;
	res.setHeader('location', to);
	res.setHeader('cache-control', 'no-cache');
	res.end();
}

function buildDesc({ sym, name, score, tier, cat, swCount, pedigree, structure, narrative, momentum }) {
	const parts = [];
	parts.push(`Oracle scored ${sym} ${score}/100 (${tier} conviction)`);
	if (cat) parts.push(`category: ${cat}`);
	if (swCount > 0) parts.push(`${swCount} proven wallet${swCount === 1 ? '' : 's'} in`);
	parts.push(`Who ${pedigree} · How ${structure} · What ${narrative} · Move ${momentum}`);
	parts.push('proof.not.promises — three.ws Oracle');
	return parts.join(' · ');
}

function shortMint(m) {
	return `${m.slice(0, 6)}…${m.slice(-4)}`;
}

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

function tierColor(tier) {
	if (tier === 'prime')  return '#c084fc';
	if (tier === 'strong') return '#34d399';
	if (tier === 'lean')   return '#fbbf24';
	if (tier === 'watch')  return '#94a3b8';
	return '#f87171';
}

function renderHtml({ title, desc, pageUrl, deepUrl, ogImage, sym, score, tier, origin }) {
	const t   = esc(title);
	const d   = esc(desc);
	const col = esc(tierColor(tier));
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<title>${t}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
	<meta name="description" content="${d}">
	<meta name="theme-color" content="#0a0a0a">

	<meta property="og:type" content="website">
	<meta property="og:site_name" content="three.ws Oracle">
	<meta property="og:title" content="${t}">
	<meta property="og:description" content="${d}">
	<meta property="og:url" content="${esc(pageUrl)}">
	<meta property="og:image" content="${esc(ogImage)}">
	<meta property="og:image:width" content="1200">
	<meta property="og:image:height" content="630">
	<meta property="og:image:alt" content="${esc(sym)} Oracle conviction score ${score}">

	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:site" content="@trythreews">
	<meta name="twitter:title" content="${t}">
	<meta name="twitter:description" content="${d}">
	<meta name="twitter:image" content="${esc(ogImage)}">

	<meta property="fc:frame" content="vNext">
	<meta property="fc:frame:image" content="${esc(ogImage)}">
	<meta property="fc:frame:image:aspect_ratio" content="1.91:1">
	<meta property="fc:frame:button:1" content="Open Oracle →">
	<meta property="fc:frame:button:1:action" content="link">
	<meta property="fc:frame:button:1:target" content="${esc(deepUrl)}">
	<meta property="fc:frame:button:2" content="Trade Feed">
	<meta property="fc:frame:button:2:action" content="link">
	<meta property="fc:frame:button:2:target" content="${esc(origin)}/trades">

	<link rel="canonical" href="${esc(pageUrl)}">
	<link rel="shortcut icon" href="/favicon.ico">

	<style>
		html,body{margin:0;padding:0;background:#0a0a0a;color:#e5e7eb;font-family:Inter,system-ui,sans-serif;height:100%}
		.shell{display:grid;place-items:center;min-height:100vh;text-align:center;padding:2rem;gap:.75rem}
		.score{font-size:3rem;font-weight:800;line-height:1;color:${col}}
		.tier{font-size:.85rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${col};opacity:.8}
		.sym{font-size:1.1rem;font-weight:700;color:#f9fafb}
		.spinner{width:24px;height:24px;border:2px solid rgba(255,255,255,.1);border-top-color:rgba(255,255,255,.5);border-radius:50%;animation:spin .9s linear infinite;margin:0 auto}
		@keyframes spin{to{transform:rotate(360deg)}}
		p{margin:0;color:rgba(255,255,255,.4);font-size:13px}
		a{color:${col};text-decoration:none}
	</style>
</head>
<body>
	<noscript>
		<div class="shell">
			<div class="sym">${esc(sym)}</div>
			<div class="score">${score}</div>
			<div class="tier">${esc(tier)}</div>
			<p>${d}</p>
			<p><a href="${esc(deepUrl)}">Open Oracle →</a></p>
		</div>
	</noscript>
	<div class="shell" aria-live="polite">
		<div class="spinner" aria-hidden="true"></div>
		<p>Loading Oracle conviction…</p>
	</div>
	<script>(function(){window.location.replace(${JSON.stringify(deepUrl)});})()</script>
</body>
</html>`;
}
