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
import { requireUser, get, patch, esc, relTime } from '../api.js';

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
				<div class="irl-name">${esc(pin.avatar_name || 'Placed agent')}</div>
				<div class="irl-meta">
					<span class="irl-meta-loc">${esc(metaLine(pin, null))}</span>
					${expiryLabel(pin.expires_at)}
				</div>
			</div>
		</div>

		<div class="irl-stats">
			${agentStats}
			<div class="irl-stat"><span class="k">Visitors</span><span class="v">${visitors}</span></div>
		</div>

		<div class="irl-section" data-skills-section hidden>
			<div class="irl-section-label">Skills</div>
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
	list.innerHTML = Array.from({ length: 3 }, () => `<div class="irl-skel"></div>`).join('');

	// Pins + interactions in parallel — interactions power both the banner and
	// each card's IRL feed.
	let pins, interactions = [], unread = 0;
	try {
		const [pinsData, ixData] = await Promise.all([
			get('/api/irl/pins?mine=1'),
			get('/api/irl/interactions?mine=1').catch(() => ({ interactions: [], unread: 0 })),
		]);
		pins = pinsData.pins || [];
		interactions = ixData.interactions || [];
		unread = ixData.unread || 0;
	} catch {
		list.innerHTML = `<div class="irl-empty"><b>Failed to load placements</b>Try refreshing the page.</div>`;
		return;
	}

	if (!pins.length) {
		list.innerHTML = `<div class="irl-empty">
			<b>No agents placed yet</b>
			Open IRL, enable your camera, and pin an agent to a real-world spot — it becomes visible to everyone who visits that location.
			<br><br>
			<a class="irl-btn primary" href="/irl">Open IRL →</a>
		</div>`;
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

		// Live wallet balance.
		fetch(`/api/agents/${encodeURIComponent(pin.agent_id)}/solana`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				const bal = data?.data?.balance;
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
		const price = s.price_usdc != null ? `$${Number(s.price_usdc).toFixed(2)} ${(s.network || 'base').toUpperCase()}` : 'Free';
		return `<div class="irl-svc"><span class="irl-svc-name">${esc(s.name || s.slug)}</span><span class="irl-svc-price">${esc(price)}</span></div>`;
	}).join('');
}

function wireCardEvents(list, pins) {
	list.addEventListener('click', async (e) => {
		const card = e.target.closest('.irl-card');
		if (!card) return;
		const id = card.dataset.id;

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
				const r = await patch('/api/irl/pins', { id, lat, lng, heading: isFinite(heading) ? heading : 0 });
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

(async function boot() {
	const el = await mountShell();
	try {
		await requireUser();
		await mount(el);
	} catch (e) {
		el.innerHTML = `<div class="irl-empty"><b>Couldn't load your IRL agents</b>${esc(e?.message || 'Please try again.')}</div>${STYLE}`;
	}
})();
