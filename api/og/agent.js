/**
 * GET /api/og/agent?id=<agentId>
 *
 * Dynamic OG image for 3D AI Agent collectible pages.
 * SVG 1200×630. Shows agent name, avatar image (or initial fallback), and
 * on-chain badge when deployed — so every shared agent link previews with
 * real identity data.
 *
 * Card anatomy (1200×630, dark):
 *   top       — three.ws wordmark + "3D AI Agent"
 *   left      — avatar image (300×300 circle) or gradient-initial
 *   center    — agent name (large), description (truncated)
 *   right     — on-chain badge (when deployed)
 *   footer    — "Build · Deploy · Trade · three.ws"
 */

import { cors, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { env } from '../_lib/env.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE   = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=60';

// Name-based gradient palette (same GRADIENTS array used in agent-detail.js)
const GRADIENTS = [
	['#6366f1', '#8b5cf6'],
	['#06b6d4', '#6366f1'],
	['#10b981', '#06b6d4'],
	['#f59e0b', '#ef4444'],
	['#ec4899', '#8b5cf6'],
	['#14b8a6', '#3b82f6'],
	['#f97316', '#ec4899'],
	['#8b5cf6', '#06b6d4'],
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

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const id  = (url.searchParams.get('id') || '').trim();

	if (!UUID_RE.test(id)) return fallback(res);

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

	const name  = trunc(row.name || 'Agent', 32);
	const desc  = trunc(row.description || '3D AI Agent on three.ws', 80);
	const isOnchain = Boolean(row.erc8004_agent_id) || Boolean(row.meta?.onchain);

	const [c1, c2] = gradientForName(row.name);
	const initial = (row.name || 'A')[0].toUpperCase();

	// Attempt to embed avatar image as base64
	let avatarData = null;
	const CDN_BASE  = env.S3_PUBLIC_DOMAIN || 'https://three.ws/cdn';
	const thumbKey  = row.thumbnail_key;
	const thumbVis  = row.visibility;
	const thumbPublic = thumbVis === 'public' || thumbVis === 'unlisted';

	if (thumbKey && thumbPublic) {
		const imgUrl = `${CDN_BASE}/${thumbKey}`;
		try {
			const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(3000) });
			if (imgResp.ok) {
				const ct = imgResp.headers.get('content-type') || 'image/jpeg';
				const ab = await imgResp.arrayBuffer();
				const b64 = Buffer.from(ab).toString('base64');
				avatarData = { ct, b64 };
			}
		} catch { /* non-fatal — use gradient fallback */ }
	}

	const AV_CX = 200, AV_CY = 315, AV_R = 140;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
		width="1200" height="630" viewBox="0 0 1200 630">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#050508"/>
			<stop offset="1" stop-color="#0d0d14"/>
		</linearGradient>
		<radialGradient id="avGlow" cx="50%" cy="50%" r="50%">
			<stop offset="0" stop-color="${x(c1)}" stop-opacity=".35"/>
			<stop offset="1" stop-color="${x(c1)}" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="avGrad" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${x(c1)}"/>
			<stop offset="1" stop-color="${x(c2)}"/>
		</linearGradient>
		${avatarData ? `<clipPath id="avClip"><circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}"/></clipPath>` : ''}
	</defs>

	<!-- background -->
	<rect width="1200" height="630" fill="url(#bg)"/>
	<rect x="0" y="0" width="4" height="630" fill="${x(c1)}" opacity=".7"/>

	<!-- avatar glow -->
	<ellipse cx="${AV_CX}" cy="${AV_CY}" rx="200" ry="200" fill="url(#avGlow)" opacity=".6"/>

	<!-- avatar circle -->
	${avatarData
		? `<image href="data:${avatarData.ct};base64,${avatarData.b64}"
			x="${AV_CX - AV_R}" y="${AV_CY - AV_R}" width="${AV_R * 2}" height="${AV_R * 2}"
			clip-path="url(#avClip)" preserveAspectRatio="xMidYMid slice"/>`
		: `<circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}" fill="url(#avGrad)" opacity=".9"/>
		   <text x="${AV_CX}" y="${AV_CY + 18}" text-anchor="middle" dominant-baseline="middle"
			font-family="Inter,system-ui,sans-serif" font-size="96" font-weight="800"
			fill="rgba(255,255,255,.9)">${x(initial)}</text>`}
	<circle cx="${AV_CX}" cy="${AV_CY}" r="${AV_R}" fill="none" stroke="${x(c1)}" stroke-width="2" opacity=".4"/>

	<!-- top bar -->
	<text x="440" y="34" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="600"
		letter-spacing=".12em" fill="#4b5563">THREE.WS</text>
	<text x="1176" y="34" font-family="Inter,system-ui,sans-serif" font-size="12"
		fill="#4b5563" text-anchor="end">3D AI Agent</text>

	<line x1="440" y1="48" x2="1176" y2="48" stroke="#1f2937" stroke-width="1"/>

	<!-- agent name -->
	<text x="440" y="130" font-family="Inter,system-ui,sans-serif" font-size="${name.length > 20 ? 42 : 52}" font-weight="800"
		fill="#f9fafb">${x(name)}</text>

	<!-- description -->
	${desc ? `<text x="440" y="178" font-family="Inter,system-ui,sans-serif" font-size="17" fill="#6b7280">${x(desc)}</text>` : ''}

	<!-- on-chain badge -->
	${isOnchain ? `<rect x="440" y="208" width="140" height="28" rx="14" fill="rgba(16,185,129,.1)" stroke="rgba(16,185,129,.4)" stroke-width="1"/>
	<text x="460" y="227" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="600"
		letter-spacing=".08em" fill="#10b981">◈ ON-CHAIN</text>` : ''}

	<!-- skills / description panels -->
	<line x1="440" y1="260" x2="1176" y2="260" stroke="#1f2937" stroke-width="1"/>

	<!-- proof tagline -->
	<text x="440" y="300" font-family="Inter,system-ui,sans-serif" font-size="15" fill="#374151">
		Build · Deploy · Trade · three.ws
	</text>

	<!-- footer -->
	<rect x="0" y="594" width="1200" height="36" fill="#030305"/>
	<text x="24" y="618" font-family="Inter,system-ui,sans-serif" font-size="12" fill="#374151"
		letter-spacing=".08em">3D AI AGENT COLLECTIBLE</text>
	<text x="1176" y="618" font-family="Inter,system-ui,sans-serif" font-size="12" fill="#374151"
		text-anchor="end">three.ws/agent/${x(id)}</text>
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
