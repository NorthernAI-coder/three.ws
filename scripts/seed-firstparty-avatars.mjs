/**
 * seed-firstparty-avatars.mjs
 * ───────────────────────────
 * Publish curated, realistic rigged avatars into the public gallery
 * (/api/avatars/public) without needing R2 write credentials.
 *
 * These GLBs ship in the repo under public/avatars/ and are served first-party
 * from https://three.ws/avatars/<file>. The avatar row stores that absolute URL
 * directly in `storage_key`; publicUrl() (api/_lib/r2.js) passes absolute URLs
 * through untouched, so model_url resolves to the first-party file instead of
 * the R2 bucket. Bucket-backed avatars (u/…) are unaffected.
 *
 * Idempotent on (owner_id, slug): re-running updates metadata in place and
 * never duplicates rows. New rows get created_at = now() so they surface at the
 * top of the newest-first gallery.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-firstparty-avatars.mjs            # apply
 *   DATABASE_URL=... node scripts/seed-firstparty-avatars.mjs --dry-run  # plan only
 *   ...--email=owner@x.com   # override seed owner (default seed@3dagent.dev)
 *
 * Required env: DATABASE_URL.
 */

import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://three.ws';

const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, '').split('=');
		return [k, v ?? true];
	}),
);
const DRY_RUN = !!args['dry-run'];
const OWNER_EMAIL = args.email || 'seed@3dagent.dev';
const SEED_DISPLAY_NAME = 'Three.ws Showcase';

if (!process.env.DATABASE_URL) {
	console.error('Missing DATABASE_URL');
	process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Curated realistic / photorealistic rigged avatars shipped under public/avatars.
// `file` is relative to the repo root; the served URL is ${ORIGIN}/avatars/<basename>.
const CATALOG = [
	{
		slug: 'selfie-girl', name: 'Selfie Girl',
		file: 'public/avatars/selfie-girl.glb',
		description: 'High-detail photorealistic female avatar with an expressive, scan-style face. Rigged and ready for streams and overlays.',
		tags: ['humanoid', 'realistic', 'photorealistic', 'rigged', 'female', 'avatar'],
		license: 'three.js example (MIT)',
	},
	{
		slug: 'aria-realistic', name: 'Aria',
		file: 'public/avatars/realistic-female.glb',
		description: 'Realistic full-body feminine avatar with PBR skin, hair, and outfit. Fully rigged for animation retargeting.',
		tags: ['humanoid', 'realistic', 'photorealistic', 'rigged', 'female', 'avatar'],
		license: 'MIT (community T-pose rig)',
	},
	{
		slug: 'kai-realistic', name: 'Kai',
		file: 'public/avatars/realistic-male.glb',
		description: 'Realistic full-body masculine avatar in a clean T-pose with PBR materials. Fully rigged and retarget-ready.',
		tags: ['humanoid', 'realistic', 'photorealistic', 'rigged', 'male', 'avatar'],
		license: 'MIT (community T-pose rig)',
	},
	{
		slug: 'vox-presenter', name: 'Vox',
		file: 'public/avatars/realistic-halfbody.glb',
		description: 'Realistic half-body presenter avatar with 18 baked facial and gesture animations — built for talking-head and assistant UIs.',
		tags: ['humanoid', 'realistic', 'rigged', 'animated', 'presenter', 'avatar'],
		license: 'MIT (community half-body rig)',
	},
	{
		slug: 'michelle-dancer', name: 'Michelle',
		file: 'public/avatars/michelle.glb',
		description: 'Realistic rigged dancer with a Mixamo-compatible skeleton and baked idle/dance clips.',
		tags: ['humanoid', 'realistic', 'rigged', 'animated', 'dancer', 'avatar'],
		license: 'three.js example (CC-BY, Mixamo)',
	},
];

const owner = await ensureOwner(OWNER_EMAIL, SEED_DISPLAY_NAME);
console.log(`\nseed-firstparty-avatars — owner=${OWNER_EMAIL} (${owner.id}) dry-run=${DRY_RUN}`);
console.log(`${CATALOG.length} candidates\n`);

const results = { created: 0, updated: 0, failed: 0 };

for (const entry of CATALOG) {
	try {
		const path = resolve(REPO_ROOT, entry.file);
		const s = await stat(path);
		if (!s.isFile()) throw new Error(`not a file: ${entry.file}`);
		const bytes = await readFile(path);
		if (bytes.slice(0, 4).toString() !== 'glTF') throw new Error(`not a GLB: ${entry.file}`);
		const checksum = createHash('sha256').update(bytes).digest('base64');
		const storageKey = `${ORIGIN}/avatars/${path.split('/').pop()}`;
		const sourceMeta = JSON.stringify({ seed: 'firstparty', license: entry.license, origin: storageKey });

		// Never publish an avatar whose model 404s. If the GLB isn't deployed to
		// the origin yet, stage it as `unlisted` (kept out of the public gallery);
		// re-running after deploy promotes it to public automatically.
		const live = await urlResolves(storageKey);
		const visibility = live ? 'public' : 'unlisted';

		const existing = await sql`
			select id from avatars where owner_id = ${owner.id} and slug = ${entry.slug} and deleted_at is null limit 1
		`;

		if (DRY_RUN) {
			console.log(`  ${existing.length ? '~' : '+'}  ${entry.slug.padEnd(18)} ${formatBytes(bytes.byteLength)}  ${visibility === 'public' ? 'PUBLIC' : 'unlisted (not live yet)'}  -> ${storageKey}`);
			existing.length ? results.updated++ : results.created++;
			continue;
		}

		const [row] = await sql`
			insert into avatars (
				owner_id, slug, name, description, storage_key, size_bytes, content_type,
				source, source_meta, visibility, tags, checksum_sha256, featured
			) values (
				${owner.id}, ${entry.slug}, ${entry.name}, ${entry.description},
				${storageKey}, ${bytes.byteLength}, 'model/gltf-binary',
				'import', ${sourceMeta}::jsonb, ${visibility}, ${entry.tags}, ${checksum}, true
			)
			on conflict (owner_id, slug) do update set
				name = excluded.name,
				description = excluded.description,
				storage_key = excluded.storage_key,
				size_bytes = excluded.size_bytes,
				source_meta = excluded.source_meta,
				visibility = excluded.visibility,
				tags = excluded.tags,
				checksum_sha256 = excluded.checksum_sha256,
				featured = true,
				deleted_at = null,
				updated_at = now()
			returning (xmax = 0) as inserted
		`;
		const tag = visibility === 'public' ? 'PUBLIC' : 'unlisted (deploy then re-run to publish)';
		if (row.inserted) {
			console.log(`  +  ${entry.slug.padEnd(18)} ${formatBytes(bytes.byteLength)}  created — ${tag}`);
			results.created++;
		} else {
			console.log(`  ~  ${entry.slug.padEnd(18)} ${formatBytes(bytes.byteLength)}  updated — ${tag}`);
			results.updated++;
		}
	} catch (e) {
		console.error(`  ✗  ${entry.slug}: ${e.message}`);
		results.failed++;
	}
}

console.log(`\ndone — created=${results.created} updated=${results.updated} failed=${results.failed}\n`);

async function ensureOwner(email, displayName) {
	const existing = await sql`select id from users where email = ${email} limit 1`;
	if (existing.length) return existing[0];
	const [row] = await sql`
		insert into users (email, display_name, email_verified, plan)
		values (${email}, ${displayName}, true, 'pro')
		returning id
	`;
	return row;
}

async function urlResolves(url) {
	try {
		const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
		return r.ok;
	} catch {
		return false;
	}
}

function formatBytes(n) {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
