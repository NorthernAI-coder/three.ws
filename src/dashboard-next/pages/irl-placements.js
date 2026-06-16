// dashboard-next — IRL Placements.
//
// Manage the 3D avatar pins you've placed at real-world GPS locations.
// Lets authenticated users view, edit, and remove their placed pins from
// any device — not just from the physical location where they pinned.
//
// Endpoints:
//   GET    /api/irl/pins?mine=1       → { pins: [...] }
//   PATCH  /api/irl/pins { id, caption } → { pin }
//   DELETE /api/irl/pins?id=<id>      → { ok: true }

import { mountShell } from '../shell.js';
import { requireUser, get, esc, relTime } from '../api.js';

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

function compassLabel(deg) {
	const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function expiryLabel(expiresAt) {
	if (!expiresAt) return '<span class="irl-badge perm">Permanent</span>';
	const ms = new Date(expiresAt) - Date.now();
	if (ms < 0) return '<span class="irl-badge expired">Expired</span>';
	const days = Math.floor(ms / 86400000);
	const hrs  = Math.floor((ms % 86400000) / 3600000);
	return `<span class="irl-badge expiring">Expires in ${days}d ${hrs}h</span>`;
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

const STYLE = `
<style>
.irl-wrap { display: grid; gap: 16px; }
.irl-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.irl-header h2 { font-size: 18px; font-weight: 700; margin: 0; }
.irl-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; font-size: 13px; font-weight: 600; text-decoration: none; transition: border-color .14s, transform .12s; }
.irl-btn:hover { border-color: var(--nxt-stroke-strong); transform: translateY(-1px); }
.irl-btn.primary { background: var(--nxt-accent); color: #061018; border-color: transparent; }

.irl-card { background: var(--nxt-panel); border: 1px solid var(--nxt-stroke); border-radius: var(--nxt-radius); overflow: hidden; }
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

.irl-card-body { border-top: 1px solid var(--nxt-line); padding: 12px 16px; display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.irl-caption { font-size: 13px; color: var(--nxt-ink-dim); flex: 1; min-width: 120px; cursor: pointer; padding: 4px 6px; border-radius: 6px; border: 1px solid transparent; transition: border-color .12s; }
.irl-caption:hover { border-color: var(--nxt-stroke); }
.irl-caption-edit { display: flex; gap: 8px; flex: 1; min-width: 180px; }
.irl-caption-input { flex: 1; background: var(--nxt-bg-2); border: 1px solid var(--nxt-accent); border-radius: 6px; color: var(--nxt-ink); padding: 5px 10px; font-size: 13px; font-family: inherit; outline: none; }
.irl-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.irl-action { font-size: 12px; padding: 5px 12px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; text-decoration: none; white-space: nowrap; transition: border-color .12s; }
.irl-action:hover { border-color: var(--nxt-stroke-strong); }
.irl-action.remove { color: #f87171; border-color: color-mix(in srgb, #f87171 30%, transparent); }
.irl-action.remove:hover { background: color-mix(in srgb, #f87171 8%, transparent); }

.irl-empty { text-align: center; padding: 60px 20px; color: var(--nxt-ink-faint); }
.irl-empty b { display: block; font-size: 16px; color: var(--nxt-ink); margin-bottom: 8px; }
.irl-skel { height: 80px; border-radius: var(--nxt-radius); background: var(--nxt-bg-2); animation: irl-pulse 1.4s ease infinite; }
@keyframes irl-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
</style>`;

let userPos = null;
navigator.geolocation?.getCurrentPosition(
	(p) => { userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; },
	() => {},
	{ timeout: 5000 },
);

function cardHtml(pin, geo) {
	const loc    = geo || `${Number(pin.lat).toFixed(5)}°, ${Number(pin.lng).toFixed(5)}°`;
	const dist   = userPos ? ` · ${(haversineDist(userPos.lat, userPos.lng, pin.lat, pin.lng) / 1000).toFixed(1)} km away` : '';
	const dir    = pin.heading != null ? ` · Facing ${compassLabel(pin.heading)}` : '';
	const placed = relTime(pin.placed_at);
	const expiry = expiryLabel(pin.expires_at);
	const caption = pin.caption || '';
	const img = pin.avatar_url
		? `<img class="irl-av" src="${esc(pin.avatar_url)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="irl-av-fallback" style="display:none">📍</div>`
		: `<div class="irl-av-fallback">📍</div>`;

	return `<div class="irl-card" data-id="${esc(pin.id)}">
		<div class="irl-card-head">
			${img}
			<div class="irl-info">
				<div class="irl-name">${esc(pin.avatar_name || 'Placed avatar')}</div>
				<div class="irl-meta">
					<span>📍 ${esc(loc)}${esc(dist)}</span>
					${expiry}
					<span>${esc(placed)}</span>
					${dir ? `<span>${esc(dir)}</span>` : ''}
				</div>
			</div>
		</div>
		<div class="irl-card-body">
			<div class="irl-caption" data-caption="${esc(caption)}" title="Click to edit caption">${caption ? esc(caption) : '<span style="color:var(--nxt-ink-faint);font-style:italic">Add a caption…</span>'}</div>
			<div class="irl-actions">
				<a class="irl-action" href="/irl?highlight=${esc(pin.id)}" target="_blank" rel="noopener">View in IRL ↗</a>
				<button class="irl-action remove" data-remove="${esc(pin.id)}">Remove</button>
			</div>
		</div>
	</div>`;
}

async function mount(el) {
	el.innerHTML = STYLE + `<div class="irl-wrap">
		<div class="irl-header">
			<h2>My Placed Avatars</h2>
			<a class="irl-btn primary" href="/irl" id="irl-place-btn">+ Place new ↗</a>
		</div>
		<div id="irl-list"></div>
	</div>`;

	const list = el.querySelector('#irl-list');
	list.innerHTML = Array.from({ length: 3 }, () => `<div class="irl-skel"></div>`).join('');

	let pins;
	try {
		const data = await get('/api/irl/pins?mine=1');
		pins = data.pins || [];
	} catch {
		list.innerHTML = `<div class="irl-empty"><b>Failed to load placements</b>Try refreshing the page.</div>`;
		return;
	}

	if (!pins.length) {
		list.innerHTML = `<div class="irl-empty">
			<b>No placements yet</b>
			Open IRL, enable your camera, and use the Lock button to pin yourself to a real-world location.
			<br><br>
			<a class="irl-btn primary" href="/irl">Open IRL →</a>
		</div>`;
		el.querySelector('#irl-place-btn').textContent = '+ Place avatar ↗';
		return;
	}

	el.querySelector('#irl-place-btn').textContent = '↺ Update placement ↗';

	// Render with lat/lng first, then update with geocoded city names async
	list.innerHTML = pins.map((p) => cardHtml(p, null)).join('');

	// Reverse-geocode in parallel (rate-limit: one at a time to be polite)
	for (const pin of pins) {
		const card = list.querySelector(`[data-id="${pin.id}"]`);
		if (!card) continue;
		const geo = await reverseGeocode(pin.lat, pin.lng);
		if (geo) {
			const metaSpan = card.querySelector('.irl-meta span:first-child');
			if (metaSpan) {
				const dist   = userPos ? ` · ${(haversineDist(userPos.lat, userPos.lng, pin.lat, pin.lng) / 1000).toFixed(1)} km away` : '';
				const dir    = pin.heading != null ? ` · Facing ${compassLabel(pin.heading)}` : '';
				metaSpan.textContent = `📍 ${geo}${dist}${dir}`;
			}
		}
	}

	// Event delegation — caption edit, remove
	list.addEventListener('click', async (e) => {
		const removeBtn = e.target.closest('[data-remove]');
		if (removeBtn) {
			const id = removeBtn.dataset.remove;
			removeBtn.disabled = true;
			removeBtn.textContent = 'Removing…';
			try {
				const r = await fetch(`/api/irl/pins?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
				if (r.ok) {
					list.querySelector(`[data-id="${id}"]`)?.remove();
					if (!list.querySelector('.irl-card')) {
						list.innerHTML = `<div class="irl-empty"><b>No placements</b>All pins removed. <a class="irl-btn" href="/irl" style="display:inline-flex;margin-top:12px">Place a new one →</a></div>`;
					}
				} else {
					removeBtn.disabled = false;
					removeBtn.textContent = 'Remove';
				}
			} catch {
				removeBtn.disabled = false;
				removeBtn.textContent = 'Remove';
			}
			return;
		}

		const captionEl = e.target.closest('.irl-caption');
		if (captionEl) {
			const card    = captionEl.closest('.irl-card');
			const id      = card.dataset.id;
			const current = captionEl.dataset.caption || '';
			captionEl.replaceWith(`<div class="irl-caption-edit">
				<input class="irl-caption-input" type="text" value="${esc(current)}" placeholder="Caption…" maxlength="140" />
				<button class="irl-action" data-save="${esc(id)}">Save</button>
				<button class="irl-action" data-cancel>Cancel</button>
			</div>`);
			card.querySelector('.irl-caption-input')?.focus();
			return;
		}

		const cancelBtn = e.target.closest('[data-cancel]');
		if (cancelBtn) {
			const card = cancelBtn.closest('.irl-card');
			const pin  = pins.find(p => p.id === card.dataset.id);
			if (pin) {
				const editEl = card.querySelector('.irl-caption-edit');
				const caption = pin.caption || '';
				editEl?.replaceWith(`<div class="irl-caption" data-caption="${esc(caption)}" title="Click to edit caption">${caption ? esc(caption) : '<span style="color:var(--nxt-ink-faint);font-style:italic">Add a caption…</span>'}</div>`);
			}
			return;
		}

		const saveBtn = e.target.closest('[data-save]');
		if (saveBtn) {
			const id    = saveBtn.dataset.save;
			const input = saveBtn.closest('.irl-caption-edit')?.querySelector('.irl-caption-input');
			const val   = input?.value?.trim() ?? '';
			saveBtn.disabled = true;
			saveBtn.textContent = 'Saving…';
			try {
				const r = await fetch('/api/irl/pins', {
					method: 'PATCH',
					credentials: 'include',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ id, caption: val || null }),
				});
				if (r.ok) {
					const pin = pins.find(p => p.id === id);
					if (pin) pin.caption = val || null;
					const card = list.querySelector(`[data-id="${id}"]`);
					const editEl = card?.querySelector('.irl-caption-edit');
					editEl?.replaceWith(`<div class="irl-caption" data-caption="${esc(val)}" title="Click to edit caption">${val ? esc(val) : '<span style="color:var(--nxt-ink-faint);font-style:italic">Add a caption…</span>'}</div>`);
				} else {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Save';
				}
			} catch {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Save';
			}
		}
	});
}

(async function boot() {
	const el = await mountShell();
	try {
		await requireUser();
		await mount(el);
	} catch (e) {
		el.innerHTML = `<div class="irl-empty"><b>Couldn't load placements</b>${esc(e?.message || 'Please try again.')}</div>${STYLE}`;
	}
})();
