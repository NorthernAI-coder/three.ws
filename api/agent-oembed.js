/**
 * oEmbed endpoint for agent URLs
 * ------------------------------
 * GET /api/oembed?url=<agent-url>[&format=json|xml]
 *
 * Implements https://oembed.com with type=rich. The html payload is a
 * sandboxed iframe pointing at /agent/:id/embed so consumers (Notion,
 * Discord, etc.) can render the agent inline.
 */

import { sql } from './_lib/db.js';
import { env } from './_lib/env.js';
import { cors, wrap, error } from './_lib/http.js';
import { resolveOnChainAgent, SERVER_CHAIN_META } from './_lib/onchain.js';
import {
	buildEmbedIframe,
	clampEmbedDim,
	agentEmbedTarget,
	onchainEmbedTarget,
	EMBED_THUMB,
} from './_lib/embed.js';

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 520;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;

	const url = new URL(req.url, 'http://x');
	const target = url.searchParams.get('url');
	const format = (url.searchParams.get('format') || 'json').toLowerCase();

	const width  = clampEmbedDim(url.searchParams.get('maxwidth'),  DEFAULT_WIDTH,  100, 2000);
	const height = clampEmbedDim(url.searchParams.get('maxheight'), DEFAULT_HEIGHT, 100, 2000);

	if (!target) return error(res, 400, 'invalid_request', 'url parameter required');

	const onchain = extractOnChain(target);
	if (onchain) return sendOnChain(res, format, { ...onchain, width, height });

	const agentId = extractAgentId(target);
	if (!agentId) return error(res, 404, 'not_found', 'url is not a recognised agent url');

	const [agent] = await sql`
		SELECT id, name, description, avatar_id
		FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL
		LIMIT 1
	`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');

	const origin = env.APP_ORIGIN;
	const { embedUrl, shareUrl, thumbnailUrl } = agentEmbedTarget(origin, agent.id);
	const title = agent.name || 'Agent';

	const payload = {
		type: 'rich',
		version: '1.0',
		provider_name: 'three.ws',
		provider_url: origin,
		title,
		author_name: title,
		author_url: shareUrl,
		html: buildEmbedIframe({ src: embedUrl, width, height, title }),
		width,
		height,
		thumbnail_url: thumbnailUrl,
		thumbnail_width: EMBED_THUMB.width,
		thumbnail_height: EMBED_THUMB.height,
	};

	res.setHeader('cache-control', 'public, max-age=900');

	if (format === 'xml') {
		res.statusCode = 200;
		res.setHeader('content-type', 'text/xml; charset=utf-8');
		res.end(toXml(payload));
		return;
	}

	res.statusCode = 200;
	res.setHeader('content-type', 'application/json+oembed; charset=utf-8');
	res.end(JSON.stringify(payload));
});

function extractAgentId(target) {
	let parsed;
	try {
		parsed = new URL(target);
	} catch {
		return null;
	}

	const originStr = `${parsed.protocol}//${parsed.host}`;
	const okOrigin =
		originStr === env.APP_ORIGIN || /^https?:\/\/localhost(:\d+)?$/.test(originStr);
	if (!okOrigin) return null;

	const match = parsed.pathname.match(/^\/agent\/([A-Za-z0-9_-]+)\/?$/);
	return match ? match[1] : null;
}

function extractOnChain(target) {
	let parsed;
	try {
		parsed = new URL(target);
	} catch {
		return null;
	}

	const originStr = `${parsed.protocol}//${parsed.host}`;
	const okOrigin =
		originStr === env.APP_ORIGIN || /^https?:\/\/localhost(:\d+)?$/.test(originStr);
	if (!okOrigin) return null;

	const match = parsed.pathname.match(/^\/a\/(\d+)\/(\d+)\/?$/);
	if (!match) return null;
	const chainId = Number(match[1]);
	const agentId = match[2];
	if (!SERVER_CHAIN_META[chainId]) return null;
	return { chainId, agentId };
}

async function sendOnChain(res, format, { chainId, agentId, width, height }) {
	const agent = await resolveOnChainAgent({ chainId, agentId });
	if (agent.error && agent.error.startsWith('chain_read')) {
		return error(res, 404, 'not_found', `agent #${agentId} not found on chain ${chainId}`);
	}

	const origin = env.APP_ORIGIN;
	const { embedUrl, shareUrl, thumbnailUrl } = onchainEmbedTarget(origin, chainId, agentId);
	const title = agent.name || `Agent #${agentId}`;

	const payload = {
		type: 'rich',
		version: '1.0',
		provider_name: 'three.ws',
		provider_url: origin,
		title,
		author_name: title,
		author_url: shareUrl,
		html: buildEmbedIframe({ src: embedUrl, width, height, title }),
		width,
		height,
		thumbnail_url: thumbnailUrl,
		thumbnail_width: EMBED_THUMB.width,
		thumbnail_height: EMBED_THUMB.height,
	};

	res.setHeader('cache-control', 'public, max-age=900');

	if (format === 'xml') {
		res.statusCode = 200;
		res.setHeader('content-type', 'text/xml; charset=utf-8');
		res.end(toXml(payload));
		return;
	}
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json+oembed; charset=utf-8');
	res.end(JSON.stringify(payload));
}

function toXml(payload) {
	const lines = Object.entries(payload).map(([k, v]) => `  <${k}>${escapeXml(String(v))}</${k}>`);
	return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<oembed>\n${lines.join('\n')}\n</oembed>`;
}

function escapeXml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
