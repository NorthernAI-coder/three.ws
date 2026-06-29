// diorama-store — durable persistence for shared dioramas (little 3D worlds).
//
// One row per published diorama. The full world plan (objects, palette, mood,
// placement, forged GLB urls) rides inline in a jsonb `doc` column — a diorama
// is small (≤ 8 objects) and is always read whole, so one indexed round-trip is
// the entire hot path. Listing reads only the cheap index columns (id, title,
// prompt, mood, created_at, views, featured) so the gallery never deserializes
// every world's full plan.
//
// Degrades cleanly: without DATABASE_URL every function returns a null/empty
// result instead of throwing, so the create flow still forges and renders worlds
// locally — only sharing (the persistent permalink) is unavailable. That mirrors
// forge-store's stateless-fallback contract.

import { randomUUID } from 'node:crypto';
import { sql } from './db.js';
import { databaseConfigured } from './env.js';
import { normalizeDiorama } from '../../src/diorama/schema.js';

export function dioramaStoreEnabled() {
	return databaseConfigured();
}

let _ensured = null;
async function ensureTable() {
	if (!dioramaStoreEnabled()) return false;
	if (_ensured) return _ensured;
	_ensured = (async () => {
		await sql`
			create table if not exists dioramas (
				id           uuid primary key,
				title        text not null,
				prompt       text not null,
				mood         text not null,
				ground       text not null,
				doc          jsonb not null,
				author       jsonb,
				client_key   text,
				views        bigint not null default 0,
				featured     boolean not null default false,
				created_at   timestamptz not null default now()
			)
		`;
		await sql`create index if not exists dioramas_created_idx on dioramas (created_at desc)`;
		await sql`create index if not exists dioramas_featured_idx on dioramas (featured, created_at desc)`;
		return true;
	})().catch((err) => {
		console.error('[diorama-store] ensureTable failed:', err?.message);
		_ensured = null;
		return false;
	});
	return _ensured;
}

/**
 * Persist a fully-forged diorama. Accepts an untrusted plan, normalizes it, and
 * writes one row. Returns { id, createdAt } or null when storage is unavailable.
 */
export async function saveDiorama({ diorama, clientKey = null }) {
	if (!(await ensureTable())) return null;
	const { ok, diorama: clean, errors } = normalizeDiorama(diorama);
	if (!ok) {
		const err = new Error(`invalid diorama: ${errors.join(', ')}`);
		err.code = 'invalid_diorama';
		throw err;
	}
	const id = randomUUID();
	const createdAt = new Date().toISOString();
	const doc = { ...clean, id, createdAt, views: 0, featured: false };
	try {
		await sql`
			insert into dioramas (id, title, prompt, mood, ground, doc, author, client_key, views, featured, created_at)
			values (
				${id}, ${doc.title}, ${doc.prompt}, ${doc.mood}, ${doc.ground},
				${JSON.stringify(doc)}::jsonb, ${doc.author ? JSON.stringify(doc.author) : null}::jsonb,
				${clientKey}, 0, false, ${createdAt}
			)
		`;
		return { id, createdAt };
	} catch (err) {
		console.error('[diorama-store] saveDiorama failed:', err?.message);
		return null;
	}
}

/** Fetch one diorama by id (the full plan). Returns the diorama or null. */
export async function getDiorama(id) {
	if (!id || !(await ensureTable())) return null;
	try {
		const rows = await sql`select doc, views from dioramas where id = ${id} limit 1`;
		if (!rows[0]) return null;
		const doc = rows[0].doc;
		doc.views = Number(rows[0].views) || doc.views || 0;
		return normalizeDiorama(doc).diorama;
	} catch (err) {
		console.error('[diorama-store] getDiorama failed:', err?.message);
		return null;
	}
}

/** Best-effort view increment; never blocks the read path. */
export async function bumpViews(id) {
	if (!id || !(await ensureTable())) return;
	try {
		await sql`update dioramas set views = views + 1 where id = ${id}`;
	} catch {
		/* a missed view count is not an error worth surfacing */
	}
}

/**
 * List dioramas for the public gallery — index columns only, no full plans.
 * scope: 'recent' (default) | 'featured'. Returns lightweight cards.
 */
export async function listDioramas({ scope = 'recent', limit = 24 } = {}) {
	if (!(await ensureTable())) return [];
	const lim = Math.min(60, Math.max(1, Number(limit) || 24));
	try {
		const rows =
			scope === 'featured'
				? await sql`
						select id, title, prompt, mood, ground, views, featured, created_at,
							doc->'objects' as objects, doc->'palette' as palette, doc->'author' as author
						from dioramas where featured = true
						order by created_at desc limit ${lim}`
				: await sql`
						select id, title, prompt, mood, ground, views, featured, created_at,
							doc->'objects' as objects, doc->'palette' as palette, doc->'author' as author
						from dioramas
						order by created_at desc limit ${lim}`;
		return rows.map(toCard);
	} catch (err) {
		console.error('[diorama-store] listDioramas failed:', err?.message);
		return [];
	}
}

// A gallery card is a diorama minus the heavy per-object GLB plumbing the list
// view never needs — but it keeps the first object's glbUrl + the palette so the
// gallery can show a real forged thumbnail and a true-to-mood gradient.
function toCard(row) {
	const objects = Array.isArray(row.objects) ? row.objects : [];
	const thumb = objects.find((o) => o && o.glbUrl)?.glbUrl || null;
	return {
		id: row.id,
		title: row.title,
		prompt: row.prompt,
		mood: row.mood,
		ground: row.ground,
		palette: row.palette || null,
		author: row.author || null,
		thumbnailGlb: thumb,
		objectCount: objects.length,
		views: Number(row.views) || 0,
		featured: Boolean(row.featured),
		createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
	};
}
