// Public Launchpad renderer — hydrates a /p/<slug> page from
// /api/launchpad/get and wires the CTA to the configured monetization flow.
//
// Self-contained: only depends on the global <agent-3d> custom element
// (registered via /embed.js / agent-3d UMD on the published page) and
// fetch + DOM. No build step needed for this file — Vite copies it to dist
// alongside the HTML.

const AGENT_3D_HOST = 'https://three.ws';

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function short(addr) {
	if (!addr) return '';
	const s = String(addr);
	return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function priceLabel(m) {
	if (!m || !m.price) return '';
	const n = Number(m.price);
	return isFinite(n) && n > 0 ? `${n} ${m.currency || ''}`.trim() : '';
}

function slugFromPath() {
	const m = location.pathname.match(/^\/p\/([a-z0-9-]+)\/?$/i);
	return m ? m[1].toLowerCase() : '';
}

async function loadConfig(slug) {
	const r = await fetch(`/api/launchpad/get?slug=${encodeURIComponent(slug)}`);
	if (r.status === 404) return { notFound: true };
	if (!r.ok) throw new Error(`Failed to load launchpad (${r.status})`);
	return r.json();
}

function renderError(root, headline, body) {
	root.innerHTML = `
		<div class="error-page">
			<h1>${esc(headline)}</h1>
			<p>${esc(body)}</p>
			<a href="/launchpad">Build your own launchpad →</a>
		</div>
	`;
}

function renderPage(root, payload) {
	const { config, template, slug } = payload;
	const brand = config?.identity?.brand || '#ffffff';
	const theme = config?.identity?.theme === 'dark' ? 'dark' : 'light';
	const headline = config?.copy?.headline || 'three.ws launchpad';
	const tagline = config?.copy?.tagline || '';
	const cta = config?.copy?.cta || 'Get started';
	const website = config?.identity?.website || '';
	const wallet = config?.identity?.wallet || '';
	const avatarSrc = config?.avatar?.src || `${AGENT_3D_HOST}/avatars/default.glb`;
	const monetize = config?.monetize || {};

	document.title = `${headline} — three.ws`;
	document.documentElement.style.setProperty('--brand', brand);

	root.innerHTML = `
		<div class="page ${theme}" style="--brand: ${esc(brand)}">
			<header class="page-header">
				<div class="brand">
					<span class="swatch"></span>
					<span>${esc(headline)}</span>
				</div>
				<nav class="links">
					${website ? `<a href="${esc(website)}" target="_blank" rel="noopener">Website</a>` : ''}
					<a href="${AGENT_3D_HOST}/launchpad?template=${esc(template)}" target="_blank" rel="noopener">Build yours</a>
				</nav>
			</header>
			<div class="hero">
				<div class="hero-copy">
					<h1>${esc(tagline || headline)}</h1>
					<p class="tagline">${esc(extraCopy(payload))}</p>
					<div class="cta-row">
						<button class="cta" type="button" data-cta>${esc(cta)}</button>
						${priceLabel(monetize) ? `<span class="price-chip">${esc(priceLabel(monetize))} per call</span>` : ''}
					</div>
					<div class="status-msg" data-status></div>
				</div>
				<div class="avatar-stage">
					<agent-3d
						src="${esc(avatarSrc)}"
						viewer
						background="transparent"
						camera-controls="auto"
						auto-rotate
					></agent-3d>
				</div>
			</div>
			<footer class="page-footer">
				Hosted on <a href="${AGENT_3D_HOST}" target="_blank" rel="noopener">three.ws</a> ·
				wallet ${esc(short(wallet) || 'not set')} ·
				<a href="${AGENT_3D_HOST}/launchpad?template=${esc(template)}" target="_blank" rel="noopener">build your own</a>
			</footer>
		</div>
	`;

	// Lazy-load agent-3d so we don't block paint.
	if (!customElements.get('agent-3d')) {
		const s = document.createElement('script');
		s.type = 'module';
		s.src = `${AGENT_3D_HOST}/embed.js`;
		document.head.appendChild(s);
	}

	const ctaBtn = root.querySelector('[data-cta]');
	const statusEl = root.querySelector('[data-status]');
	ctaBtn.addEventListener('click', () => onCtaClick(payload, ctaBtn, statusEl));
}

function extraCopy(payload) {
	const { template, config } = payload;
	if (template === 'token-launchpad') {
		const t = config?.token || {};
		const name = t.name || 'your token';
		const ticker = t.ticker ? ` ($${t.ticker})` : '';
		return `One click launches ${name}${ticker} on Pump.fun. Creator fees route to ${short(config?.identity?.wallet)}.`;
	}
	// Legacy templates (paid-concierge / gated-showroom) render as hosted
	// landing pages; their CTA routes to the creator's own channel below.
	if (config?.identity?.website) {
		return `Built on three.ws. Continue to ${short(config?.identity?.wallet)}'s site to take the next step.`;
	}
	return '';
}

// CTA handler. The only template with an on-platform action is the token
// launchpad (one-click Pump.fun mint). Every other published page is a hosted
// landing page whose CTA continues to the creator's own website — never a
// dead endpoint.
function onCtaClick(payload, btn, statusEl) {
	const { template, config } = payload;
	if (template === 'token-launchpad') {
		// Pump.fun coin creation lives on the public /launch surface, where the
		// visitor picks a wallet and signs the mint transaction themselves.
		window.open(`${AGENT_3D_HOST}/launch`, '_blank', 'noopener');
		statusEl.textContent = 'Opened the three.ws launch flow in a new tab.';
		statusEl.className = 'status-msg ok';
		return;
	}
	const website = config?.identity?.website || '';
	if (website) {
		const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
		window.open(href, '_blank', 'noopener');
		statusEl.textContent = 'Continuing to the creator’s site…';
		statusEl.className = 'status-msg ok';
		return;
	}
	statusEl.textContent = 'This page has no destination set yet — add a website in the Studio.';
	statusEl.className = 'status-msg err';
}

// ─────── Boot ───────
const slug = slugFromPath();
const root = document.getElementById('root');

if (!slug) {
	renderError(root, 'No launchpad slug', 'Try /p/<your-slug> or build a new one.');
} else {
	loadConfig(slug)
		.then((payload) => {
			if (payload.notFound) {
				renderError(root, '404 — not found', `No launchpad published at /p/${slug}.`);
				return;
			}
			renderPage(root, payload);
		})
		.catch((err) => {
			renderError(root, 'Could not load launchpad', err.message || String(err));
		});
}
