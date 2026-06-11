/**
 * Repair poisoned avatar OG thumbnail keys.
 *
 * The pre-fix avatar-OG cache derived its key from `storage_key` with a naive
 * `.glb → _og.png` swap. For first-party / externally-hosted avatars the
 * storage_key is an ABSOLUTE URL (https://three.ws/avatars/michelle.glb), so
 * the derived "key" became a full origin URL (https://three.ws/avatars/
 * michelle_og.png). publicUrl() passes absolute keys through verbatim, so that
 * value pointed at the site instead of the R2 CDN — where no object exists. The
 * result was a broken <img> in the lobby/gallery and a 302-to-404 for social
 * crawlers (the michelle_og.png "failed to load img" runtime errors).
 *
 * ogKeyFor() now caches those under `og/avatar/<id>.png`. This script clears the
 * already-poisoned `thumbnail_key`s so the corrected key regenerates on the next
 * OG crawl. Safe + idempotent: it only nulls absolute, origin-pointing `_og.png`
 * keys (relative R2 keys and customizer `_thumb.jpg` snapshots are untouched).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/repair-avatar-og-keys.mjs --dry-run   # plan
 *   DATABASE_URL=... node scripts/repair-avatar-og-keys.mjs             # apply
 */

import { neon } from '@neondatabase/serverless';

const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
	console.error('Missing DATABASE_URL');
	process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Poisoned ⇔ thumbnail_key is an absolute URL ending in `_og.png`. A correct OG
// key is always a relative bucket key, so this never matches a healthy row.
const POISON_PATTERN = '^https?://.*_og\\.png$';

const affected = await sql`
	select id, name, slug, thumbnail_key
	from avatars
	where deleted_at is null
	  and thumbnail_key ~* ${POISON_PATTERN}
	order by created_at asc
`;

console.log(`repair-avatar-og-keys — dry-run=${DRY_RUN}`);
console.log(`${affected.length} avatar(s) with poisoned OG thumbnail keys\n`);

for (const a of affected) {
	console.log(`  ${DRY_RUN ? '~' : '✓'}  ${String(a.slug || a.id).padEnd(24)} ${a.thumbnail_key}`);
}

if (!affected.length) {
	console.log('Nothing to repair.');
	process.exit(0);
}

if (DRY_RUN) {
	console.log('\nDry run — no changes written.');
	process.exit(0);
}

const result = await sql`
	update avatars set thumbnail_key = null, updated_at = now()
	where deleted_at is null
	  and thumbnail_key ~* ${POISON_PATTERN}
`;

console.log(`\nCleared ${result.length ?? affected.length} poisoned key(s). They regenerate on the next OG crawl.`);
process.exit(0);
