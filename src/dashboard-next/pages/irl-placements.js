// dashboard-next — IRL Agents.
//
// Monitor and manage the 3D AI agents you've placed at real-world GPS
// locations — from any device, not just from the spot where you pinned them.
//
// Per placement the owner can see and control:
//   • Balance        — the agent's Solana wallet balance (GET /api/agents/:id/solana)
//   • Reputation     — public reputation score (GET /api/irl/agent-card?id=…)
//   • Services       — the paid services the agent offers IRL
//   • Interactions   — live feed of people who tapped the agent in real life
//                      (GET /api/irl/interactions?mine=1), incl. their messages
//   • Outfit         — jump to the avatar wardrobe to re-skin it
//   • Location       — re-position / re-aim the pin remotely (PATCH /api/irl/pins)
//   • Caption, View in IRL, Remove
//
// Endpoints:
//   GET    /api/irl/pins?mine=1                  → { pins }
//   GET    /api/irl/interactions?mine=1          → { interactions, unread }
//   PATCH  /api/irl/interactions { }             → mark all seen
//   GET    /api/irl/agent-card?id=<agentId>      → { card }
//   GET    /api/agents/:id/solana                → { data: { balance } }
//   PATCH  /api/irl/pins { id, caption|lat|lng|heading } → { pin }
//   DELETE /api/irl/pins?id=<id>                 → { ok: true }

import { mountShell } from '../shell.js';
import { requireUser, get, post, patch, esc, relTime } from '../api.js';
import { skeletonHTML, emptyStateHTML, errorStateHTML, ensureStateKitStyles, attachRetry } from '../../shared/state-kit.js';

// ── Services / x402 skill pricing ───────────────────────────────────────────
// Canonical prices live in agent_skill_prices and feed the x402 manifest +
// priceFor() (api/agents/x402/[action].js). The owner attaches a skill the
// agent exposes and sets a per-call price; a passer-by then pays for it IRL.

// Solana mint validity — matches api/agent-skill-price.js:14. Base-chain USDC is
// a 0x EVM address that fails this, so IRL skill pricing is Solana-mint only.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// The only currencies offered — the platform coin and Solana USDC. Both are
// 6-decimal SPL mints, so the displayed price (e.g. 0.05) converts to atomic
// units with 10**6. Never a third token.
const CURRENCIES = [
	{ key: 'three', label: '$THREE', mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump', decimals: 6, chain: 'solana' },
	{ key: 'usdc',  label: 'USDC',   mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, chain: 'solana' },
];
function currencyForMint(mint) {
	return CURRENCIES.find((c) => c.mint === mint)
		|| { label: `${String(mint).slice(0, 4)}…${String(mint).slice(-4)}`, mint, decimals: 6, chain: 'solana' };
}
// Displayed decimal → integer atomic units (what the API stores).
function toAtomic(display, decimals) {
	return Math.round(Number(display) * 10 ** decimals);
}
// Integer atomic units → human price string (maximumFractionDigits drops any
// trailing zeros, so 50000 @ 6dp → "0.05", 1000000 @ 6dp → "1").
function fromAtomic(amount, decimals) {
	const n = Number(amount) / 10 ** decimals;
	if (!Number.isFinite(n)) return '0';
	return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function haversineDist(lat1, lng1, lat2, lng2) {
	const R = 6371000;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compassLabel(deg) {
	return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function expiryLabel(expiresAt) {
	if (!expiresAt) return '<span class="irl-badge perm">Permanent</span>';
	const ms = new Date(expiresAt) - Date.now();
	if (ms < 0) return '<span class="irl-badge expired">Expired</span>';
	const days = Math.floor(ms / 86400000);
	const hrs  = Math.floor((ms % 86400000) / 3600000);
	return `<span class="irl-badge expiring">Expires in ${days}d ${hrs}h</span>`;
}

// Live status pill from the agent-summary-derived status. Self-contained
// (inline token colours) so it has no external CSS dependency.
const STATUS_META = {
	online:  { c: 'var(--nxt-success, #4ade80)', label: 'Online' },
	visible: { c: 'var(--nxt-warn, #fbbf24)',    label: 'Visible' },
	expired: { c: 'var(--nxt-ink-faint, #555)',  label: 'Expired' },
};
function statusBadge(status) {
	const s = STATUS_META[status] || STATUS_META.visible;
	return `<span class="irl-status-pill" title="${s.label}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:${s.c};flex-shrink:0">`
		+ `<span style="width:7px;height:7px;border-radius:50%;background:${s.c}"></span>${s.label}</span>`;
}

// Derive the avatar-editor (wardrobe) URL from a pin's avatar_url. IRL pins store
// either /api/avatars/<id>/glb or /avatars/<id>... — pull the id so "Change outfit"
// deep-links to the real wardrobe; fall back to the avatars dashboard otherwise.
function outfitHref(pin) {
	const url = pin.avatar_url || '';
	const m = url.match(/\/avatars\/([^/?#]+)/) || url.match(/\/api\/avatars\/([^/?#]+)/);
	return m ? `/avatars/${m[1]}/edit` : '/dashboard/avatars';
}

async function reverseGeocode(lat, lng) {
	try {
		const r = await fetch(
			`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
			{ headers: { 'User-Agent': 'three.ws/1.0' } },
		);
		const d = await r.json();
		return d.address?.city || d.address?.town || d.address?.village
			|| d.address?.county || d.display_name?.split(',')[0] || null;
	} catch { return null; }
}

const INTERACTION_ICON = { view: '👁', message: '💬', pay: '💸' };
function interactionLine(ix) {
	const icon = INTERACTION_ICON[ix.type] || '•';
	const who  = ix.type === 'message' ? 'Someone left a message' : ix.type === 'pay' ? 'Someone paid your agent' : 'Someone viewed your agent';
	const msg  = ix.message ? `<span class="irl-ix-msg">“${esc(ix.message)}”</span>` : '';
	return `<div class="irl-ix"><span class="irl-ix-icon" aria-hidden="true">${icon}</span>
		<div class="irl-ix-body"><span class="irl-ix-who">${who}</span>${msg}
		<span class="irl-ix-time">${esc(relTime(ix.created_at))}</span></div></div>`;
}

const STYLE = `
<style>
.irl-wrap { display: grid; gap: var(--space-4, 16px); }
.irl-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.irl-header h2 { font-size: 18px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 10px; }

/* Multiplayer AR info banner */
.irl-mp-banner { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: var(--nxt-radius); border: 1px solid color-mix(in srgb, var(--nxt-accent) 22%, transparent); background: color-mix(in srgb, var(--nxt-accent) 5%, transparent); }
.irl-mp-banner .mp-icon { font-size: 20px; flex-shrink: 0; line-height: 1.3; }
.irl-mp-banner .mp-body { flex: 1; font-size: 13px; color: var(--nxt-ink-dim); line-height: 1.5; }
.irl-mp-banner .mp-body strong { color: var(--nxt-ink); display: block; margin-bottom: 2px; font-size: 13px; }

/* Skills chips */
.irl-skills { display: flex; flex-wrap: wrap; gap: 6px; }
.irl-skill { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, #7c3aed 12%, transparent); color: #a78bfa; border: 1px solid color-mix(in srgb, #7c3aed 30%, transparent); white-space: nowrap; }
.irl-unread-pill { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--nxt-accent) 16%, transparent); color: var(--nxt-accent); border: 1px solid color-mix(in srgb, var(--nxt-accent) 32%, transparent); }
.irl-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; font-size: 13px; font-weight: 600; text-decoration: none; transition: border-color .14s, transform .12s; }
.irl-btn:hover { border-color: var(--nxt-stroke-strong); transform: translateY(-1px); }
.irl-btn.primary { background: var(--nxt-accent); color: #061018; border-color: transparent; }

/* New-interactions banner */
.irl-feed-banner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--nxt-radius); border: 1px solid color-mix(in srgb, var(--nxt-accent) 28%, transparent); background: color-mix(in srgb, var(--nxt-accent) 7%, transparent); }
.irl-feed-banner .txt { flex: 1; font-size: 13px; color: var(--nxt-ink); }
.irl-feed-banner b { color: var(--nxt-accent); }

.irl-card { background: var(--nxt-panel, var(--nxt-bg-1)); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); overflow: hidden; }
.irl-card-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.irl-av { width: 48px; height: 48px; border-radius: 11px; object-fit: cover; background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); flex-shrink: 0; }
.irl-av-fallback { width: 48px; height: 48px; border-radius: 11px; background: linear-gradient(135deg, #1a2035, #0d1018); border: 1px solid var(--nxt-stroke); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.irl-info { flex: 1; min-width: 0; }
.irl-name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.irl-meta { font-size: 12px; color: var(--nxt-ink-faint); margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.irl-badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; border: 1px solid transparent; white-space: nowrap; }
.irl-badge.perm { color: var(--nxt-success); background: color-mix(in srgb, var(--nxt-success) 10%, transparent); border-color: color-mix(in srgb, var(--nxt-success) 30%, transparent); }
.irl-badge.expired { color: var(--nxt-ink-faint); background: var(--nxt-bg-2); border-color: var(--nxt-stroke); }
.irl-badge.expiring { color: var(--nxt-warn); background: color-mix(in srgb, var(--nxt-warn) 10%, transparent); border-color: color-mix(in srgb, var(--nxt-warn) 30%, transparent); }

/* Stat chips: balance / reputation / services / visitors */
.irl-stats { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 12px; }
.irl-stat { display: flex; flex-direction: column; gap: 1px; padding: 7px 12px; border-radius: 10px; background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); min-width: 76px; }
.irl-stat .k { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--nxt-ink-faint); }
.irl-stat .v { font-size: 14px; font-weight: 700; color: var(--nxt-ink); font-variant-numeric: tabular-nums; }
.irl-stat.skel .v { color: transparent; background: var(--nxt-stroke); border-radius: 4px; width: 40px; animation: irl-pulse 1.4s ease infinite; }
.irl-stat a.v { text-decoration: none; color: var(--nxt-accent); }

.irl-section { border-top: 1px solid var(--nxt-line, var(--nxt-stroke)); padding: 12px 16px; }
.irl-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--nxt-ink-faint); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
.irl-section-label a { color: var(--nxt-accent); text-decoration: none; font-size: 11px; text-transform: none; letter-spacing: 0; }

/* Services */
.irl-svc-list { display: flex; flex-direction: column; gap: 6px; }
.irl-svc { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.irl-svc-name { color: var(--nxt-ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.irl-svc-price { color: var(--nxt-success); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.irl-svc-empty { font-size: 12px; color: var(--nxt-ink-faint); }

/* Inline link-style button (matches section-label affordances) */
.irl-link-btn { background: none; border: none; padding: 0; cursor: pointer; color: var(--nxt-accent); font: inherit; font-size: 12px; font-weight: 600; }
.irl-link-btn:hover { text-decoration: underline; }
.irl-link-btn:disabled { opacity: .6; cursor: default; text-decoration: none; }
.irl-link-btn.danger { color: var(--nxt-danger, #f87171); }

/* ── Services management modal ─────────────────────────────────────────────── */
.irl-modal-root { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.irl-modal-back { position: absolute; inset: 0; background: rgba(0,0,0,.62); backdrop-filter: blur(2px); animation: irl-fade .16s ease; }
.irl-modal { position: relative; width: min(560px, 100%); max-height: min(86vh, 760px); display: flex; flex-direction: column; background: var(--nxt-panel, var(--nxt-bg-1)); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); box-shadow: 0 24px 64px rgba(0,0,0,.5); animation: irl-rise .2s cubic-bezier(.2,.7,.3,1); overflow: hidden; }
.irl-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--nxt-stroke); }
.irl-modal-title { font-size: 16px; font-weight: 700; color: var(--nxt-ink); }
.irl-modal-sub { font-size: 12px; color: var(--nxt-ink-faint); margin-top: 2px; }
.irl-modal-x { background: none; border: none; color: var(--nxt-ink-faint); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; border-radius: 8px; transition: color .14s; }
.irl-modal-x:hover, .irl-modal-x:focus-visible { color: var(--nxt-ink); outline: none; }
.irl-modal-body { padding: 6px 18px 18px; overflow-y: auto; }
.irl-svc-sec { padding-top: 14px; }
.irl-svc-sec-h { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--nxt-ink-faint); margin-bottom: 10px; }
.irl-svc-count { color: var(--nxt-ink-dim); }

/* Priced-service rows */
.irl-pr-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); margin-bottom: 8px; transition: border-color .2s, background .2s; }
.irl-pr-row.paused { opacity: .72; }
.irl-pr-row.saved { border-color: color-mix(in srgb, var(--nxt-success) 60%, transparent); background: color-mix(in srgb, var(--nxt-success) 9%, var(--nxt-bg-2)); }
.irl-pr-name { font-size: 14px; font-weight: 600; color: var(--nxt-ink); display: flex; align-items: center; gap: 8px; }
.irl-pr-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 999px; background: var(--nxt-bg-1); border: 1px solid var(--nxt-stroke); color: var(--nxt-ink-faint); font-weight: 600; }
.irl-pr-meta { font-size: 12px; color: var(--nxt-ink-faint); margin-top: 2px; }
.irl-pr-price { color: var(--nxt-success); font-weight: 700; font-variant-numeric: tabular-nums; }
.irl-pr-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.irl-pr-input { width: 84px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-1); color: var(--nxt-ink); font: inherit; font-size: 13px; }
.irl-pr-input:focus-visible { outline: none; border-color: var(--nxt-accent); }
.irl-pr-cur { font-size: 12px; color: var(--nxt-ink-faint); }
.irl-pr-confirm { font-size: 12px; color: var(--nxt-ink-dim); }
.irl-pr-err { grid-column: 1 / -1; font-size: 12px; color: var(--nxt-danger, #f87171); }

/* Add-service form */
.irl-add-form { display: flex; flex-direction: column; gap: 12px; }
.irl-add-grid { display: grid; grid-template-columns: 1.3fr .9fr .9fr; gap: 10px; }
.irl-add-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.irl-add-field > span { font-size: 11px; color: var(--nxt-ink-faint); text-transform: uppercase; letter-spacing: .04em; }
.irl-add-field select, .irl-add-field input { padding: 9px 10px; border-radius: 9px; border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); font: inherit; font-size: 13px; width: 100%; }
.irl-add-field select:focus-visible, .irl-add-field input:focus-visible { outline: none; border-color: var(--nxt-accent); }
.irl-add-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.irl-add-hint { font-size: 11px; color: var(--nxt-ink-faint); }
.irl-add-err { font-size: 12px; color: var(--nxt-danger, #f87171); }
@media (max-width: 520px) { .irl-add-grid { grid-template-columns: 1fr 1fr; } .irl-add-field:first-child { grid-column: 1 / -1; } }

@keyframes irl-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes irl-rise { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: none; } }

/* Interactions feed */
.irl-ix { display: flex; gap: 9px; padding: 6px 0; }
.irl-ix-icon { font-size: 14px; line-height: 1.4; flex-shrink: 0; }
.irl-ix-body { display: flex; flex-direction: column; gap: 1px; font-size: 13px; min-width: 0; }
.irl-ix-who { color: var(--nxt-ink-dim); }
.irl-ix-msg { color: var(--nxt-ink); }
.irl-ix-time { font-size: 11px; color: var(--nxt-ink-faint); }
.irl-ix-empty { font-size: 12px; color: var(--nxt-ink-faint); }

/* Caption + management */
.irl-card-body { border-top: 1px solid var(--nxt-line, var(--nxt-stroke)); padding: 12px 16px; display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.irl-caption { font-size: 13px; color: var(--nxt-ink-dim); flex: 1; min-width: 120px; cursor: pointer; padding: 4px 6px; border-radius: 6px; border: 1px solid transparent; transition: border-color .12s; }
.irl-caption:hover { border-color: var(--nxt-stroke); }
.irl-caption-edit { display: flex; gap: 8px; flex: 1; min-width: 180px; }
.irl-caption-input { flex: 1; background: var(--nxt-bg-2); border: 1px solid var(--nxt-accent); border-radius: 6px; color: var(--nxt-ink); padding: 5px 10px; font-size: 13px; font-family: inherit; outline: none; }
.irl-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
.irl-action { font-size: 12px; padding: 5px 12px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; text-decoration: none; white-space: nowrap; transition: border-color .12s; }
.irl-action:hover { border-color: var(--nxt-stroke-strong); }
.irl-action.remove { color: var(--nxt-danger, #f87171); border-color: color-mix(in srgb, var(--nxt-danger, #f87171) 30%, transparent); }
.irl-action.remove:hover { background: color-mix(in srgb, var(--nxt-danger, #f87171) 8%, transparent); }

/* Location editor */
.irl-loc-edit { border-top: 1px dashed var(--nxt-stroke); padding: 12px 16px; display: none; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
.irl-loc-edit.open { display: flex; }
.irl-loc-field { display: flex; flex-direction: column; gap: 4px; }
.irl-loc-field label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--nxt-ink-faint); }
.irl-loc-field input { width: 110px; background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); border-radius: 7px; color: var(--nxt-ink); padding: 6px 9px; font-size: 13px; font-family: inherit; outline: none; font-variant-numeric: tabular-nums; }
.irl-loc-field input:focus { border-color: var(--nxt-accent); }
.irl-loc-field.heading input { width: 78px; }

.irl-empty { text-align: center; padding: 60px 20px; color: var(--nxt-ink-faint); }
.irl-empty b { display: block; font-size: 16px; color: var(--nxt-ink); margin-bottom: 8px; }
.irl-skel { height: 120px; border-radius: var(--nxt-radius); background: var(--nxt-bg-2); animation: irl-pulse 1.4s ease infinite; }
@keyframes irl-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
</style>`;

let userPos = null;
navigator.geolocation?.getCurrentPosition(
	(p) => { userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; },
	() => {},
	{ timeout: 5000 },
);

function metaLine(pin, geo) {
	const loc  = geo || `${Number(pin.lat).toFixed(5)}°, ${Number(pin.lng).toFixed(5)}°`;
	const dist = userPos ? ` · ${(haversineDist(userPos.lat, userPos.lng, pin.lat, pin.lng) / 1000).toFixed(1)} km away` : '';
	const dir  = pin.heading != null ? ` · Facing ${compassLabel(pin.heading)}` : '';
	return `📍 ${loc}${dist}${dir}`;
}

function cardHtml(pin, ixList) {
	const caption = pin.caption || '';
	const img = pin.avatar_url
		? `<img class="irl-av" src="${esc(pin.avatar_url)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="irl-av-fallback" style="display:none">📍</div>`
		: `<div class="irl-av-fallback">📍</div>`;

	const visitors = Number(pin.view_count) || 0;
	const pinIx = ixList.filter((x) => x.pin_id === pin.id).slice(0, 4);
	const ixHtml = pinIx.length
		? pinIx.map(interactionLine).join('')
		: `<div class="irl-ix-empty">No one has interacted with this agent in person yet. Share its location to get discovered.</div>`;

	// Stat chips — balance & reputation fill in async (skeleton until then).
	const agentStats = pin.agent_id ? `
			<div class="irl-stat skel" data-stat="balance"><span class="k">Balance</span><span class="v">—</span></div>
			<div class="irl-stat skel" data-stat="reputation"><span class="k">Reputation</span><span class="v">—</span></div>
			<div class="irl-stat skel" data-stat="services"><span class="k">Services</span><span class="v">—</span></div>` : '';

	return `<div class="irl-card" data-id="${esc(pin.id)}" data-agent="${esc(pin.agent_id || '')}"
		data-lat="${esc(pin.lat)}" data-lng="${esc(pin.lng)}" data-heading="${esc(pin.heading ?? 0)}">
		<div class="irl-card-head">
			${img}
			<div class="irl-info">
				<div class="irl-name-row" style="display:flex;align-items:center;gap:8px;min-width:0">
					<span class="irl-name">${esc(pin.avatar_name || 'Placed agent')}</span>
					${statusBadge(pin.status)}
				</div>
				<div class="irl-meta">
					<span class="irl-meta-loc">${esc(metaLine(pin, null))}</span>
					${expiryLabel(pin.expires_at)}
				</div>
			</div>
		</div>

		<div class="irl-stats">
			${agentStats}
			<div class="irl-stat"><span class="k">Interactions</span><span class="v">${Number(pin.interaction_count) || visitors}</span></div>
			<div class="irl-stat"><span class="k">Last seen</span><span class="v" style="font-size:12.5px">${esc(pin.last_interaction_at ? relTime(pin.last_interaction_at) : 'No visits')}</span></div>
		</div>

		<div class="irl-section" data-skills-section hidden>
			<div class="irl-section-label">Skills
				<button class="irl-link-btn" data-manage-services type="button">Manage prices →</button>
			</div>
			<div class="irl-skills" data-skills-list></div>
		</div>

		<div class="irl-section" data-services hidden>
			<div class="irl-section-label">Services <a href="/dashboard/monetize">Manage ↗</a></div>
			<div class="irl-svc-list" data-svc-list></div>
		</div>

		<div class="irl-section">
			<div class="irl-section-label">IRL interactions</div>
			<div data-ix-list>${ixHtml}</div>
		</div>

		<div class="irl-card-body">
			<div class="irl-caption" data-caption="${esc(caption)}" title="Click to edit caption">${caption ? esc(caption) : '<span style="color:var(--nxt-ink-faint);font-style:italic">Add a caption…</span>'}</div>
			<div class="irl-actions">
				<a class="irl-action" href="${esc(outfitHref(pin))}" target="_blank" rel="noopener">Change outfit ↗</a>
				<button class="irl-action" data-loc-toggle>Move / re-aim</button>
				<a class="irl-action" href="/irl?highlight=${esc(pin.id)}" target="_blank" rel="noopener">View in IRL ↗</a>
				<button class="irl-action remove" data-remove="${esc(pin.id)}">Remove</button>
			</div>
		</div>

		<div class="irl-loc-edit" data-loc-edit>
			<div class="irl-loc-field"><label>Latitude</label><input type="number" step="0.00001" data-loc="lat" value="${esc(Number(pin.lat).toFixed(5))}" /></div>
			<div class="irl-loc-field"><label>Longitude</label><input type="number" step="0.00001" data-loc="lng" value="${esc(Number(pin.lng).toFixed(5))}" /></div>
			<div class="irl-loc-field heading"><label>Heading°</label><input type="number" min="0" max="359" step="1" data-loc="heading" value="${esc(Math.round(pin.heading ?? 0))}" /></div>
			<button class="irl-action" data-loc-here>Use my location</button>
			<button class="irl-btn primary" data-loc-save>Save location</button>
		</div>
	</div>`;
}

async function mount(el) {
	el.innerHTML = STYLE + `<div class="irl-wrap">
		<div class="irl-header">
			<h2>My IRL Agents <span class="irl-unread-pill" id="irl-unread" hidden></span></h2>
			<a class="irl-btn primary" href="/irl" id="irl-place-btn">+ Place new ↗</a>
		</div>
		<div id="irl-mp-banner"></div>
		<div id="irl-banner"></div>
		<div id="irl-list"></div>
	</div>`;

	// Multiplayer AR explainer — shown once at the top so owners understand
	// that their placed agents are visible to ALL users who visit that location.
	el.querySelector('#irl-mp-banner').innerHTML = `<div class="irl-mp-banner">
		<span class="mp-icon" aria-hidden="true">🌐</span>
		<div class="mp-body"><strong>Multiplayer AR — your agents are public</strong>
			Anyone who opens three.ws/irl near your pin location will see your 3D agent in their camera view. You can update the agent's caption, outfit, and location remotely at any time.</div>
	</div>`;

	const list = el.querySelector('#irl-list');
	list.innerHTML = skeletonHTML(3, 'row');

	// Pins + interactions in parallel — interactions power both the banner and
	// each card's IRL feed.
	let pins, interactions = [], unread = 0;
	try {
		const [sumData, ixData] = await Promise.all([
			get('/api/irl/agent-summary?mine=1'),
			get('/api/irl/interactions?mine=1').catch(() => ({ interactions: [], unread: 0 })),
		]);
		// agent-summary keys each row by pin_id and adds derived monitoring signals
		// (status, interaction_count, last_interaction_at). Normalize pin_id→id so
		// the existing card code is unchanged.
		pins = (sumData.agents || []).map((a) => ({ ...a, id: a.pin_id }));
		interactions = ixData.interactions || [];
		unread = ixData.unread || 0;
	} catch {
		list.innerHTML = errorStateHTML({ title: "Couldn't load your IRL agents", body: 'Check your connection and try again.', scope: 'irl' });
		attachRetry(list, () => mount(el));
		return;
	}

	if (!pins.length) {
		list.innerHTML = emptyStateHTML({
			icon: '📍',
			title: 'No agents placed yet',
			body: 'Open IRL, enable your camera, and pin an agent to a real-world spot — it becomes visible to everyone who visits that location.',
			actions: [{ label: 'Open IRL', href: '/irl', primary: true }],
		});
		el.querySelector('#irl-place-btn').textContent = '+ Place agent ↗';
		return;
	}

	// Unread banner + pill
	const unreadEl = el.querySelector('#irl-unread');
	if (unread > 0) {
		unreadEl.textContent = `${unread} new`;
		unreadEl.hidden = false;
		el.querySelector('#irl-banner').innerHTML = `<div class="irl-feed-banner">
			<span class="txt"><b>${unread}</b> ${unread === 1 ? 'person' : 'people'} interacted with your agents in real life.</span>
			<button class="irl-btn" id="irl-mark-seen">Mark all seen</button>
		</div>`;
		el.querySelector('#irl-mark-seen')?.addEventListener('click', async (e) => {
			e.target.disabled = true;
			await patch('/api/irl/interactions', {}).catch(() => {});
			unreadEl.hidden = true;
			el.querySelector('#irl-banner').innerHTML = '';
		});
	}

	list.innerHTML = pins.map((p) => cardHtml(p, interactions)).join('');

	// ── Async enrichment per card: balance, reputation, services, geocode ──────
	for (const pin of pins) {
		const card = list.querySelector(`[data-id="${pin.id}"]`);
		if (!card) continue;

		// Reverse-geocode the location label (serial, polite to Nominatim).
		reverseGeocode(pin.lat, pin.lng).then((geo) => {
			if (geo) {
				const locEl = card.querySelector('.irl-meta-loc');
				if (locEl) locEl.textContent = metaLine(pin, geo);
			}
		});

		if (!pin.agent_id) continue;

		// Reputation + services from the IRL agent-card (public, cached).
		fetch(`/api/irl/agent-card?id=${encodeURIComponent(pin.agent_id)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				const card2 = data?.card;
				if (!card2) { fillStatError(card, 'reputation'); fillStatError(card, 'services'); return; }
				fillStat(card, 'reputation', String(card2.reputation?.score ?? 0));
				const svc = card2.services || [];
				fillStat(card, 'services', String(svc.length));
				renderServices(card, svc);
			})
			.catch(() => { fillStatError(card, 'reputation'); fillStatError(card, 'services'); });

		// Agent skills from the agent profile endpoint.
		fetch(`/api/agents/${encodeURIComponent(pin.agent_id)}`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				const skills = data?.agent?.skills || [];
				renderSkills(card, skills);
			})
			.catch(() => {});

		// Live wallet balance. The authenticated owner path returns { data: { sol,
		// lamports, balance_error } } (no `balance` field — that only exists on the
		// public-read shape), so read `sol` and surface RPC throttling explicitly
		// instead of silently rendering "—" for every owned agent.
		fetch(`/api/agents/${encodeURIComponent(pin.agent_id)}/solana`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				const d = data?.data || data || {};
				if (d.balance_error) { fillStat(card, 'balance', 'Unavailable'); return; }
				const bal = d.balance ?? d.sol;
				fillStat(card, 'balance', bal == null ? '—' : `◎${Number(bal).toFixed(2)}`);
			})
			.catch(() => fillStatError(card, 'balance'));
	}

	wireCardEvents(list, pins);
}

function fillStat(card, key, value) {
	const el = card.querySelector(`[data-stat="${key}"]`);
	if (!el) return;
	el.classList.remove('skel');
	el.querySelector('.v').textContent = value;
}
function fillStatError(card, key) {
	const el = card.querySelector(`[data-stat="${key}"]`);
	if (!el) return;
	el.classList.remove('skel');
	el.querySelector('.v').textContent = '—';
}

function renderSkills(card, skills) {
	const section = card.querySelector('[data-skills-section]');
	const listEl  = card.querySelector('[data-skills-list]');
	if (!section || !listEl || !skills.length) return;
	section.hidden = false;
	listEl.innerHTML = skills.slice(0, 12).map((s) => `<span class="irl-skill">${esc(s)}</span>`).join('');
}

function renderServices(card, services) {
	const section = card.querySelector('[data-services]');
	const listEl  = card.querySelector('[data-svc-list]');
	if (!section || !listEl) return;
	section.hidden = false;
	if (!services.length) {
		listEl.innerHTML = `<div class="irl-svc-empty">No paid services yet. <a href="/dashboard/monetize">Add one →</a></div>`;
		return;
	}
	listEl.innerHTML = services.map((s) => {
		// agent-card v2 shape: services carry price_usd + chain + skill (was price_usdc/network/slug).
		const priceVal = s.price_usd ?? s.price_usdc;
		const chain = s.chain || s.network || 'base';
		const price = priceVal != null ? `$${Number(priceVal).toFixed(2)} ${String(chain).toUpperCase()}` : 'Free';
		return `<div class="irl-svc"><span class="irl-svc-name">${esc(s.name || s.skill || s.slug)}</span><span class="irl-svc-price">${esc(price)}</span></div>`;
	}).join('');
}

function wireCardEvents(list, pins) {
	list.addEventListener('click', async (e) => {
		const card = e.target.closest('.irl-card');
		if (!card) return;
		const id = card.dataset.id;

		// Manage paid services (x402 skill pricing) for this agent
		if (e.target.closest('[data-manage-services]')) {
			const agentId = card.dataset.agent;
			if (agentId) {
				const name = card.querySelector('.irl-name')?.textContent?.trim() || 'agent';
				openServicesModal(agentId, name);
			}
			return;
		}

		// Remove
		const removeBtn = e.target.closest('[data-remove]');
		if (removeBtn) {
			removeBtn.disabled = true;
			removeBtn.textContent = 'Removing…';
			try {
				const r = await fetch(`/api/irl/pins?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
				if (r.ok) {
					card.remove();
					if (!list.querySelector('.irl-card')) {
						list.innerHTML = `<div class="irl-empty"><b>No placements</b>All agents removed. <a class="irl-btn" href="/irl" style="display:inline-flex;margin-top:12px">Place a new one →</a></div>`;
					}
				} else { removeBtn.disabled = false; removeBtn.textContent = 'Remove'; }
			} catch { removeBtn.disabled = false; removeBtn.textContent = 'Remove'; }
			return;
		}

		// Toggle location editor
		if (e.target.closest('[data-loc-toggle]')) {
			card.querySelector('[data-loc-edit]')?.classList.toggle('open');
			return;
		}

		// "Use my location" — fill lat/lng from the browser
		if (e.target.closest('[data-loc-here]')) {
			const btn = e.target.closest('[data-loc-here]');
			btn.disabled = true; btn.textContent = 'Locating…';
			navigator.geolocation?.getCurrentPosition(
				(p) => {
					card.querySelector('[data-loc="lat"]').value = p.coords.latitude.toFixed(5);
					card.querySelector('[data-loc="lng"]').value = p.coords.longitude.toFixed(5);
					btn.disabled = false; btn.textContent = 'Use my location';
				},
				() => { btn.disabled = false; btn.textContent = 'Location unavailable'; },
				{ enableHighAccuracy: true, timeout: 8000 },
			);
			return;
		}

		// Save location
		if (e.target.closest('[data-loc-save]')) {
			const btn = e.target.closest('[data-loc-save]');
			const lat = parseFloat(card.querySelector('[data-loc="lat"]').value);
			const lng = parseFloat(card.querySelector('[data-loc="lng"]').value);
			const heading = parseInt(card.querySelector('[data-loc="heading"]').value, 10);
			if (!isFinite(lat) || !isFinite(lng)) { btn.textContent = 'Invalid coordinates'; return; }
			btn.disabled = true; btn.textContent = 'Saving…';
			try {
				// Omit heading when the field is blank so a blank input PRESERVES the
				// stored bearing instead of silently re-aiming the agent to North (0°).
				const r = await patch('/api/irl/pins', { id, lat, lng, ...(isFinite(heading) ? { heading } : {}) });
				if (r.pin) {
					const pin = pins.find((p) => p.id === id);
					if (pin) { pin.lat = r.pin.lat; pin.lng = r.pin.lng; pin.heading = r.pin.heading; }
					card.querySelector('.irl-meta-loc').textContent = metaLine(r.pin, null);
					reverseGeocode(r.pin.lat, r.pin.lng).then((geo) => {
						if (geo) card.querySelector('.irl-meta-loc').textContent = metaLine(r.pin, geo);
					});
					btn.textContent = 'Saved ✓';
					setTimeout(() => { btn.disabled = false; btn.textContent = 'Save location'; card.querySelector('[data-loc-edit]')?.classList.remove('open'); }, 900);
				} else { btn.disabled = false; btn.textContent = 'Save location'; }
			} catch { btn.disabled = false; btn.textContent = 'Retry save'; }
			return;
		}

		// Caption — click to edit
		const captionEl = e.target.closest('.irl-caption');
		if (captionEl) {
			const current = captionEl.dataset.caption || '';
			captionEl.replaceWith(makeNode(`<div class="irl-caption-edit">
				<input class="irl-caption-input" type="text" value="${esc(current)}" placeholder="Caption…" maxlength="140" aria-label="Placement caption" />
				<button class="irl-action" data-save="${esc(id)}">Save</button>
				<button class="irl-action" data-cancel>Cancel</button>
			</div>`));
			card.querySelector('.irl-caption-input')?.focus();
			return;
		}

		// Caption — cancel
		if (e.target.closest('[data-cancel]')) {
			const pin = pins.find((p) => p.id === id);
			restoreCaption(card, pin?.caption || '');
			return;
		}

		// Caption — save
		const saveBtn = e.target.closest('[data-save]');
		if (saveBtn) {
			const input = saveBtn.closest('.irl-caption-edit')?.querySelector('.irl-caption-input');
			const val = input?.value?.trim() ?? '';
			saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
			try {
				const r = await patch('/api/irl/pins', { id, caption: val || null });
				if (r.pin !== undefined) {
					const pin = pins.find((p) => p.id === id);
					if (pin) pin.caption = val || null;
					restoreCaption(card, val);
				} else { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
			} catch { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
		}
	});
}

function makeNode(html) {
	const t = document.createElement('template');
	t.innerHTML = html.trim();
	return t.content.firstElementChild;
}
function restoreCaption(card, caption) {
	const editEl = card.querySelector('.irl-caption-edit');
	const node = makeNode(`<div class="irl-caption" data-caption="${esc(caption)}" title="Click to edit caption">${caption ? esc(caption) : '<span style="color:var(--nxt-ink-faint);font-style:italic">Add a caption…</span>'}</div>`);
	editEl?.replaceWith(node);
}

// ── Services modal: attach/price the skills this agent offers IRL ───────────
function openServicesModal(agentId, agentName) {
	const root = makeNode(`<div class="irl-modal-root">
		<div class="irl-modal-back"></div>
		<div class="irl-modal" role="dialog" aria-modal="true" aria-label="Manage paid services">
			<div class="irl-modal-head">
				<div class="irl-modal-titles">
					<div class="irl-modal-title">Paid services</div>
					<div class="irl-modal-sub">${esc(agentName)} · pay-per-call via x402</div>
				</div>
				<button class="irl-modal-x" data-close type="button" aria-label="Close">×</button>
			</div>
			<div class="irl-modal-body" data-body>${skeletonHTML(3, 'row')}</div>
		</div>
	</div>`);
	ensureStateKitStyles();
	document.body.appendChild(root);
	document.body.style.overflow = 'hidden';

	const body = root.querySelector('[data-body]');
	const close = () => {
		root.remove();
		document.body.style.overflow = '';
		document.removeEventListener('keydown', onKey, true);
	};
	const onKey = (ev) => { if (ev.key === 'Escape') close(); };
	document.addEventListener('keydown', onKey, true);
	root.querySelector('[data-close]').addEventListener('click', close);
	root.querySelector('.irl-modal-back').addEventListener('click', close);
	setTimeout(() => root.querySelector('[data-close]')?.focus(), 0);

	// state.prices: active (+ in-session paused) agent_skill_prices rows.
	// state.skills: skills the agent actually exposes — the only priceable set.
	// state.catalog: best-effort slug→marketplace-skill metadata (name/suggested).
	const state = { prices: [], skills: [], catalog: {} };

	async function load() {
		try {
			const [pricing, agentResp] = await Promise.all([
				get(`/api/agents/${encodeURIComponent(agentId)}/skills-pricing`),
				get(`/api/agents/${encodeURIComponent(agentId)}`),
			]);
			state.prices = (pricing?.prices || []).map((p) => ({ ...p }));
			state.skills = Array.isArray(agentResp?.agent?.skills) ? agentResp.agent.skills : [];
			try {
				const sk = await get('/api/skills?installed=true');
				const arr = Array.isArray(sk) ? sk : (sk?.skills || sk?.data?.skills || []);
				for (const s of arr) if (s?.slug) state.catalog[s.slug] = s;
			} catch { /* metadata is optional — raw skill names still work */ }
			renderShell();
		} catch {
			body.innerHTML = errorStateHTML({
				title: "Couldn't load services",
				body: 'Check your connection and try again.',
			});
			body.querySelector('[data-sk-retry]')?.addEventListener('click', () => {
				body.innerHTML = skeletonHTML(3, 'row');
				load();
			});
		}
	}

	function renderShell() {
		body.innerHTML = `
			<section class="irl-svc-sec">
				<div class="irl-svc-sec-h">Active services <span class="irl-svc-count" data-count></span></div>
				<div data-active></div>
			</section>
			<section class="irl-svc-sec">
				<div class="irl-svc-sec-h">Add a service</div>
				<div data-add></div>
			</section>`;
		renderActive();
		renderAdd();
	}

	function skillName(slug) { return state.catalog[slug]?.name || slug; }

	function renderActive() {
		const host = body.querySelector('[data-active]');
		const countEl = body.querySelector('[data-count]');
		if (countEl) countEl.textContent = state.prices.length ? `· ${state.prices.length}` : '';
		if (!host) return;
		if (!state.prices.length) {
			host.innerHTML = emptyStateHTML({
				compact: true,
				title: 'No paid services yet',
				body: 'Attach a skill below and set a per-call price so visitors can pay this agent in person.',
			});
			return;
		}
		host.innerHTML = state.prices.map(rowHtml).join('');
	}

	function rowHtml(p) {
		const cur = currencyForMint(p.currency_mint);
		const human = fromAtomic(p.amount, cur.decimals);
		const paused = !!p._paused;
		const free = Number(p.amount) === 0;
		const priceText = free ? 'Free' : `${human} ${esc(cur.label)}`;
		return `<div class="irl-pr-row${paused ? ' paused' : ''}" data-row="${esc(p.skill)}">
			<div class="irl-pr-main">
				<div class="irl-pr-name">${esc(skillName(p.skill))}${paused ? '<span class="irl-pr-tag">paused</span>' : ''}</div>
				<div class="irl-pr-meta"><span class="irl-pr-price">${priceText}</span> · ${esc(cur.label)} on ${esc(p.chain || 'solana')}</div>
			</div>
			<div class="irl-pr-actions" data-actions>
				<button class="irl-link-btn" data-edit="${esc(p.skill)}" type="button">Edit price</button>
				${paused
					? `<button class="irl-link-btn" data-resume="${esc(p.skill)}" type="button">Resume</button>`
					: `<button class="irl-link-btn" data-pause="${esc(p.skill)}" type="button">Pause</button>`}
				<button class="irl-link-btn danger" data-remove-svc="${esc(p.skill)}" type="button">Remove</button>
			</div>
			<div class="irl-pr-err" data-row-err hidden></div>
		</div>`;
	}

	function rowEl(skill) { return body.querySelector(`[data-row="${CSS.escape(skill)}"]`); }
	function rowError(skill, msg) {
		const e = rowEl(skill)?.querySelector('[data-row-err]');
		if (e) { e.textContent = msg; e.hidden = !msg; }
	}
	function pulse(skill) {
		const r = rowEl(skill);
		if (!r) return;
		r.classList.remove('saved'); void r.offsetWidth; r.classList.add('saved');
	}

	// Enter inline edit mode for a row's price.
	function beginEdit(skill) {
		const p = state.prices.find((x) => x.skill === skill);
		const row = rowEl(skill);
		if (!p || !row) return;
		const cur = currencyForMint(p.currency_mint);
		const actions = row.querySelector('[data-actions]');
		actions.innerHTML = `
			<input class="irl-pr-input" type="number" min="0" step="any" value="${esc(fromAtomic(p.amount, cur.decimals))}" aria-label="New price in ${esc(cur.label)}" />
			<span class="irl-pr-cur">${esc(cur.label)}</span>
			<button class="irl-link-btn" data-save-edit="${esc(skill)}" type="button">Save</button>
			<button class="irl-link-btn" data-cancel-edit type="button">Cancel</button>`;
		actions.querySelector('.irl-pr-input')?.focus();
	}

	// Write a price (atomic) for a skill via the canonical single-skill upsert.
	async function writePrice(skill, atomic, mint, chain) {
		return post(`/api/agent-skill-price?agentId=${encodeURIComponent(agentId)}`, {
			skill, amount: atomic, currency_mint: mint, chain,
		});
	}

	function renderAdd() {
		const host = body.querySelector('[data-add]');
		if (!host) return;
		const priced = new Set(state.prices.map((p) => p.skill));
		const available = state.skills.filter((s) => !priced.has(s));

		if (!state.skills.length) {
			host.innerHTML = emptyStateHTML({
				compact: true,
				title: 'This agent exposes no skills',
				body: 'Give the agent skills first, then price them here as paid services.',
			});
			return;
		}
		if (!available.length) {
			host.innerHTML = emptyStateHTML({
				compact: true,
				title: 'Every exposed skill is priced',
				body: 'Edit or pause a service above to change it.',
			});
			return;
		}

		const opts = available.map((s) => `<option value="${esc(s)}">${esc(skillName(s))}</option>`).join('');
		const curOpts = CURRENCIES.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join('');
		host.innerHTML = `<form class="irl-add-form" data-add-form>
			<div class="irl-add-grid">
				<label class="irl-add-field">
					<span>Skill</span>
					<select data-f="skill">${opts}</select>
				</label>
				<label class="irl-add-field">
					<span>Price / call</span>
					<input data-f="amount" type="number" min="0" step="any" placeholder="0.05" inputmode="decimal" />
				</label>
				<label class="irl-add-field">
					<span>Currency</span>
					<select data-f="currency">${curOpts}</select>
				</label>
			</div>
			<div class="irl-add-row">
				<span class="irl-add-hint">0 = free / deactivated. Stored on-chain as atomic units.</span>
				<button class="irl-btn primary" data-add-submit type="submit">Add service</button>
			</div>
			<div class="irl-add-err" data-add-err hidden></div>
		</form>`;

		// Prefill a suggested price from the marketplace catalog when present.
		const form = host.querySelector('[data-add-form]');
		const skillSel = form.querySelector('[data-f="skill"]');
		const amountInput = form.querySelector('[data-f="amount"]');
		const syncSuggested = () => {
			const meta = state.catalog[skillSel.value];
			const sugg = meta && Number(meta.price_per_call_usd) > 0 ? Number(meta.price_per_call_usd) : null;
			amountInput.placeholder = sugg != null ? String(sugg) : '0.05';
		};
		skillSel.addEventListener('change', syncSuggested);
		syncSuggested();
	}

	function addError(msg) {
		const e = body.querySelector('[data-add-err]');
		if (e) { e.textContent = msg; e.hidden = !msg; }
	}

	// ── Delegated actions ────────────────────────────────────────────────────
	body.addEventListener('submit', async (e) => {
		if (!e.target.closest('[data-add-form]')) return;
		e.preventDefault();
		const form = e.target;
		const skill = form.querySelector('[data-f="skill"]').value;
		const amountRaw = form.querySelector('[data-f="amount"]').value;
		const cur = CURRENCIES[Number(form.querySelector('[data-f="currency"]').value)] || CURRENCIES[0];

		addError('');
		if (!skill) return addError('Pick a skill');
		const amount = Number(amountRaw);
		if (!(amount >= 0)) return addError('Price must be ≥ 0');
		if (!BASE58_RE.test(cur.mint)) return addError('Invalid mint');
		if (!state.skills.includes(skill)) return addError("This agent doesn't expose that skill");

		const atomic = toAtomic(amount, cur.decimals);
		const btn = form.querySelector('[data-add-submit]');
		btn.disabled = true; btn.textContent = 'Adding…';
		try {
			await writePrice(skill, atomic, cur.mint, cur.chain);
			// amount=0 deactivates server-side; only list it when it's a live price.
			const existing = state.prices.find((p) => p.skill === skill);
			if (atomic > 0) {
				if (existing) Object.assign(existing, { amount: atomic, currency_mint: cur.mint, chain: cur.chain, _paused: false });
				else state.prices.push({ skill, amount: atomic, currency_mint: cur.mint, chain: cur.chain });
			}
			renderActive(); renderAdd();
			if (atomic > 0) pulse(skill);
		} catch (err) {
			btn.disabled = false; btn.textContent = 'Add service';
			addError(err?.status === 403 ? 'Not your agent' : (err?.message || 'Could not save'));
		}
	});

	body.addEventListener('click', async (e) => {
		// Edit price
		const editBtn = e.target.closest('[data-edit]');
		if (editBtn) return beginEdit(editBtn.dataset.edit);

		// Cancel edit
		if (e.target.closest('[data-cancel-edit]')) return renderActive();

		// Save edited price
		const saveBtn = e.target.closest('[data-save-edit]');
		if (saveBtn) {
			const skill = saveBtn.dataset.saveEdit;
			const p = state.prices.find((x) => x.skill === skill);
			const input = rowEl(skill)?.querySelector('.irl-pr-input');
			if (!p || !input) return;
			const cur = currencyForMint(p.currency_mint);
			const amount = Number(input.value);
			rowError(skill, '');
			if (!(amount >= 0)) return rowError(skill, 'Price must be ≥ 0');
			const atomic = toAtomic(amount, cur.decimals);
			saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
			try {
				await writePrice(skill, atomic, p.currency_mint, p.chain || cur.chain);
				if (atomic === 0) { state.prices = state.prices.filter((x) => x.skill !== skill); }
				else { p.amount = atomic; p._paused = false; }
				renderActive(); renderAdd();
				if (atomic > 0) pulse(skill);
			} catch (err) {
				saveBtn.disabled = false; saveBtn.textContent = 'Save';
				rowError(skill, err?.message || 'Could not save');
			}
			return;
		}

		// Pause (deactivate, keep amount for in-session resume)
		const pauseBtn = e.target.closest('[data-pause]');
		if (pauseBtn) {
			const skill = pauseBtn.dataset.pause;
			const p = state.prices.find((x) => x.skill === skill);
			if (!p) return;
			pauseBtn.disabled = true; pauseBtn.textContent = 'Pausing…';
			try {
				await writePrice(skill, 0, p.currency_mint, p.chain || 'solana');
				p._paused = true;
				renderActive();
			} catch (err) {
				pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
				rowError(skill, err?.message || 'Could not pause');
			}
			return;
		}

		// Resume (re-assert the retained price)
		const resumeBtn = e.target.closest('[data-resume]');
		if (resumeBtn) {
			const skill = resumeBtn.dataset.resume;
			const p = state.prices.find((x) => x.skill === skill);
			if (!p) return;
			const cur = currencyForMint(p.currency_mint);
			resumeBtn.disabled = true; resumeBtn.textContent = 'Resuming…';
			try {
				await writePrice(skill, Number(p.amount) || 0, p.currency_mint, p.chain || cur.chain);
				p._paused = false;
				renderActive();
				pulse(skill);
			} catch (err) {
				resumeBtn.disabled = false; resumeBtn.textContent = 'Resume';
				rowError(skill, err?.message || 'Could not resume');
			}
			return;
		}

		// Remove — inline confirm, then deactivate
		const removeBtn = e.target.closest('[data-remove-svc]');
		if (removeBtn) {
			const skill = removeBtn.dataset.removeSvc;
			const actions = rowEl(skill)?.querySelector('[data-actions]');
			if (!actions) return;
			actions.innerHTML = `<span class="irl-pr-confirm">Remove this service?</span>
				<button class="irl-link-btn" data-cancel-edit type="button">Keep</button>
				<button class="irl-link-btn danger" data-remove-yes="${esc(skill)}" type="button">Remove</button>`;
			return;
		}
		const removeYes = e.target.closest('[data-remove-yes]');
		if (removeYes) {
			const skill = removeYes.dataset.removeYes;
			const p = state.prices.find((x) => x.skill === skill);
			if (!p) return;
			removeYes.disabled = true; removeYes.textContent = 'Removing…';
			try {
				await writePrice(skill, 0, p.currency_mint, p.chain || 'solana');
				state.prices = state.prices.filter((x) => x.skill !== skill);
				renderActive(); renderAdd();
			} catch (err) {
				removeYes.disabled = false; removeYes.textContent = 'Remove';
				rowError(skill, err?.message || 'Could not remove');
			}
		}
	});

	load();
}

(async function boot() {
	const el = await mountShell();
	try {
		await requireUser();
		await mount(el);
	} catch (e) {
		el.innerHTML = `<div class="irl-empty"><b>Couldn't load your IRL agents</b>${esc(e?.message || 'Please try again.')}</div>${STYLE}`;
	}
})();
