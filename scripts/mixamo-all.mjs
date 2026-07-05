#!/usr/bin/env node
/**
 * mixamo-all.mjs — Complete Mixamo animation pipeline
 *
 * Phases (each is resumable — re-run anytime to continue from where it left off):
 *
 *   Phase 1 — Catalog   (no auth needed)
 *     Fetches all 2,400+ Mixamo Motions AND MotionPacks (names, IDs,
 *     categories) from the public Mixamo API and saves them to
 *     scripts/mixamo-catalog.json.
 *
 *   Phase 2 — Download  (needs MIXAMO_TOKEN)
 *     For each catalog entry, triggers a retarget export on Mixamo, polls
 *     the character monitor until the file is ready, and saves it to
 *     animation-sources/ (MotionPacks arrive as zips and are extracted to
 *     one mx-*.fbx per clip). Skips entries already downloaded. Respects
 *     rate limits with exponential backoff. Saves progress to
 *     scripts/mixamo-progress.json after each file.
 *     Exports are serial by default: Mixamo's status endpoint is the
 *     per-character monitor, so concurrent exports on one character
 *     interleave. gms_hash params are flattened to the comma-joined value
 *     string the export API requires (raw arrays get HTTP 400).
 *
 *   Phase 3 — Integrate
 *     Reads the saved mx-*.fbx files, cross-references the catalog for
 *     human-readable names, and regenerates scripts/mixamo-library.config.json
 *     (icon + loop flag inferred per clip). The curated set in
 *     scripts/animations.config.json stays hand-managed and untouched —
 *     the bulk library never ships in public/.
 *
 *   Phase 4 — Build
 *     Retargets every library clip to the canonical skeleton via
 *     scripts/build-animations.mjs with staging overrides, writing baked
 *     clip JSONs to animation-sources/.library-clips/ (gitignored, ~3 GB
 *     for the full catalog).
 *
 *   Phase 5 — Upload  (needs S3_* creds, see below)
 *     Uploads baked clips to R2 under animations/library/clips/<name>.json
 *     and publishes animations/library/manifest.json. Served to users via
 *     GET /api/animations/library + the R2 CDN. Content-hash cached in
 *     scripts/mixamo-upload-state.json — re-run uploads only changed clips.
 *
 * Usage:
 *   node scripts/mixamo-all.mjs              # run all phases
 *   node scripts/mixamo-all.mjs --catalog    # phase 1 only (no auth)
 *   node scripts/mixamo-all.mjs --download   # phases 1+2 (needs MIXAMO_TOKEN)
 *   node scripts/mixamo-all.mjs --integrate  # phases 1+3 (use saved sources)
 *   node scripts/mixamo-all.mjs --build      # phase 4 only
 *   node scripts/mixamo-all.mjs --upload     # phase 5 only (needs S3_* creds)
 *   node scripts/mixamo-all.mjs --concurrency=5 --limit=50  # tuning flags
 *
 * Required for upload phase (same names the production API uses — pull with
 * `vercel env pull .env.local`): S3_ENDPOINT, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_DOMAIN.
 *
 * Required for download phase:
 *   MIXAMO_TOKEN in .env.local — either run node scripts/get-mixamo-token.mjs
 *   (needs ADOBE_EMAIL/ADOBE_PASSWORD in .env.local), or copy it by hand:
 *   log in at mixamo.com → DevTools → Network → any api/v1 request →
 *   Request Headers → "Authorization: Bearer eyJ…" (token only, no "Bearer ").
 *   Tokens expire after ~24h; on 401 refresh the token and re-run.
 *
 * Optional:
 *   MIXAMO_CHARACTER_ID — export character override. Defaults to the
 *   account's primary character (/characters/primary), falling back to Y-Bot.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Config ─────────────────────────────────────────────────────────────────
const Y_BOT_ID = '4f5d21e1-4ccc-41f1-b35b-fb2547bd8493';
const MIXAMO_API = 'https://www.mixamo.com/api/v1';
const PAGE_LIMIT = 96;
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 40;
const RATE_LIMIT_BASE_MS = 30_000;
const RATE_LIMIT_MAX_MS = 300_000;

// ── Parse CLI flags ────────────────────────────────────────────────────────
const flags = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const m = a.match(/^--([^=]+)(?:=(.*))?$/);
		return m ? [m[1], m[2] ?? true] : [a, true];
	}),
);

const RUN_CATALOG   = flags.catalog   || flags.download || flags.integrate || flags.all || (!Object.keys(flags).length);
const RUN_DOWNLOAD  = flags.download  || flags.all       || (!Object.keys(flags).length);
const RUN_INTEGRATE = flags.integrate || flags.all       || (!Object.keys(flags).length);
const RUN_BUILD     = flags.build     || flags.all       || (!Object.keys(flags).length);
const RUN_UPLOAD    = flags.upload    || flags.all       || (!Object.keys(flags).length);
// Serial by default — export status comes from the per-character monitor, so
// parallel exports on the same character clobber each other's results.
const CONCURRENCY   = Number(flags.concurrency) || 1;
const MAX_DOWNLOADS = flags.limit ? Number(flags.limit) : Infinity;

// ── Sharding ─────────────────────────────────────────────────────────────────
// --shard=I/N splits the catalog across N cooperating downloaders (one per
// Mixamo account/token, ideally one per egress IP). Shard I (1-indexed) claims
// every clip whose catalog index ≡ (I-1) mod N — an interleave, so each shard
// gets an even mix of fast/slow clips. Shards write disjoint slices but share
// animation-sources/, and the on-disk mx-*.fbx existence check is the final
// dedup guard, so overlapping or restarted shards never re-export a clip.
function parseShard(v) {
	if (!v || v === true) return { index: 1, count: 1 };
	const m = String(v).match(/^(\d+)\s*\/\s*(\d+)$/);
	if (!m) throw new Error(`--shard must look like I/N (e.g. 2/6), got "${v}"`);
	const index = Number(m[1]);
	const count = Number(m[2]);
	if (index < 1 || index > count) throw new Error(`--shard index ${index} out of range for ${count} shards`);
	return { index, count };
}
const SHARD = parseShard(flags.shard);

// ── Paths ──────────────────────────────────────────────────────────────────
const CATALOG_PATH  = join(__dirname, 'mixamo-catalog.json');
// Each shard keeps its own progress file so parallel processes never clobber
// one another's writes (the shared FBX-on-disk check still dedups across them).
const PROGRESS_PATH = SHARD.count > 1
	? join(__dirname, `mixamo-progress.shard-${SHARD.index}-of-${SHARD.count}.json`)
	: join(__dirname, 'mixamo-progress.json');
const SOURCES_DIR   = join(ROOT, 'animation-sources');

// Bulk library outputs — all gitignored; the library ships via R2, not git.
const LIBRARY_CONFIG_PATH   = join(__dirname, 'mixamo-library.config.json');
const LIBRARY_STAGE_DIR     = join(ROOT, 'animation-sources/.library-clips');
const LIBRARY_MANIFEST_PATH = join(LIBRARY_STAGE_DIR, 'manifest.json');
const UPLOAD_STATE_PATH     = join(__dirname, 'mixamo-upload-state.json');
const LIBRARY_R2_PREFIX     = 'animations/library';

mkdirSync(SOURCES_DIR, { recursive: true });

// ── Env / token ────────────────────────────────────────────────────────────
function loadEnv(key) {
	if (process.env[key]) return process.env[key].trim();
	const p = join(ROOT, '.env.local');
	if (existsSync(p)) {
		const line = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
		if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
	}
	return null;
}

// ── Rate-limit helpers ─────────────────────────────────────────────────────
let cooldownUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCooldown() {
	while (Date.now() < cooldownUntil) await sleep(Math.min(2000, cooldownUntil - Date.now()));
}

function setCooldown(retryAfterSec, attempt) {
	const backoff = Math.min(RATE_LIMIT_BASE_MS * 2 ** attempt, RATE_LIMIT_MAX_MS);
	const explicit = retryAfterSec ? Number(retryAfterSec) * 1000 : 0;
	const wait = Math.max(explicit, backoff);
	const until = Date.now() + wait;
	if (until > cooldownUntil) {
		cooldownUntil = until;
		console.log(`  ⏸  Rate limited — pausing ${(wait / 1000).toFixed(0)}s`);
	}
}

async function rlFetch(url, init = {}, attempt = 0) {
	await waitCooldown();
	const res = await fetch(url, init);
	if (res.status === 429) {
		setCooldown(res.headers.get('retry-after'), attempt);
		if (attempt >= 6) throw new Error('429 (max retries)');
		return rlFetch(url, init, attempt + 1);
	}
	return res;
}

// ── Slug / icon helpers ────────────────────────────────────────────────────
const slugify = (s) =>
	s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);

const ICON_MAP = [
	[/dance|shuffle|twerk|hip.?hop|disco|breakdance|floss|gangnam|dab/i, '💃'],
	[/walk|stride|stroll|march|sneak|creep|crawl/i, '🚶'],
	[/run|sprint|jog|dash|chase/i, '🏃'],
	[/jump|leap|hop|vault|flip|aerial/i, '🦘'],
	[/fight|punch|kick|combat|attack|hit|strike|block|dodge|parry/i, '🥊'],
	[/zombie|monster|creature|undead/i, '🧟'],
	[/wave|greet|hello|bye/i, '👋'],
	[/taunt|insult|mock|point/i, '😤'],
	[/idle|stand|wait|breath/i, '🧍'],
	[/sit|crouch|kneel|squat/i, '🪑'],
	[/cheer|celebrate|victory|happy|joy|clap/i, '🎉'],
	[/angry|rage|frustrated|defeat/i, '😠'],
	[/sad|cry|mourn|defeated/i, '😔'],
	[/pray|bow|worship/i, '🙏'],
	[/climb|scale/i, '🧗'],
	[/swim|dive/i, '🏊'],
	[/shoot|aim|rifle|pistol|gun/i, '🔫'],
	[/sword|blade|slash|stab/i, '⚔️'],
	[/magic|cast|spell/i, '✨'],
	[/work|dig|build|carry|lift/i, '⚒️'],
	[/sport|soccer|football|basketball|tennis/i, '⚽'],
	[/yoga|stretch|workout|exercise/i, '🧘'],
];

function iconFor(label) {
	for (const [re, icon] of ICON_MAP) if (re.test(label)) return icon;
	return '🎬';
}

function loopFor(label) {
	const lbl = label.toLowerCase();
	if (/idle|walk|run|stand|wait|breath|loop|cycle|patrol|sneak|creep|crouch|smoke|lean|vtubing|swim|jog|march/i.test(lbl)) return true;
	return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — CATALOG
// ═══════════════════════════════════════════════════════════════════════════
async function fetchCatalog() {
	console.log('\n── Phase 1: Fetch Mixamo catalog ─────────────────────────');

	if (existsSync(CATALOG_PATH)) {
		const existing = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
		// Older caches predate MotionPack support and carry no `type` field.
		if (existing.length && existing.every((e) => e.type)) {
			console.log(`  Catalog exists (${existing.length} products) — using cached version.`);
			console.log(`  Delete scripts/mixamo-catalog.json to re-fetch.`);
			return existing;
		}
		console.log('  Cached catalog predates MotionPack support — re-fetching.');
	}

	const animations = [];
	let page = 1;

	while (true) {
		process.stdout.write(`\r  Fetching page ${page} (${animations.length} so far)…   `);
		const res = await rlFetch(
			`${MIXAMO_API}/products?page=${page}&limit=${PAGE_LIMIT}&type=Motion%2CMotionPack&order=relevance`,
			{ headers: { 'X-Api-Key': 'mixamo2', Accept: 'application/json' } },
		);
		if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status}`);
		const data = await res.json();
		const results = data.results ?? [];
		animations.push(
			...results.map((r) => ({
				id: r.id,
				type: r.type || 'Motion',
				name: r.description || r.name || r.id,
				category: r.category || '',
				tags: r.tags ?? [],
			})),
		);
		const totalPages = data.pagination?.num_pages ?? 1;
		if (page >= totalPages || results.length === 0) break;
		page++;
		await sleep(120);
	}

	process.stdout.write('\n');
	writeFileSync(CATALOG_PATH, JSON.stringify(animations, null, 2));
	console.log(`  ✅ Saved ${animations.length} animations to scripts/mixamo-catalog.json`);
	return animations;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════
// Export API rejects gms_hash whose `params` is the raw [[name, value], …]
// array with HTTP 400 — it wants the values flattened to "0,0,0,0".
function flattenGmsHash(g) {
	if (!g) return null;
	const params = Array.isArray(g.params) ? g.params.map((p) => p[1]).join(',') : (g.params ?? '0');
	return { ...g, params };
}

// The status endpoint Mixamo's own UI polls is the per-character monitor.
// Some deployments also expose a per-product export status — fall back to it
// once if the monitor 404s.
let pollViaMonitor = true;

async function pollForDownloadUrl(animId, characterId, authHeaders) {
	for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
		await sleep(POLL_INTERVAL_MS);
		const url = pollViaMonitor
			? `${MIXAMO_API}/characters/${characterId}/monitor`
			: `${MIXAMO_API}/animations/export/${animId}?character_id=${characterId}`;
		const res = await rlFetch(url, { headers: authHeaders });
		if (res.status === 404 && pollViaMonitor) {
			pollViaMonitor = false;
			continue;
		}
		if (res.status === 401 || res.status === 403) throw new Error(`poll HTTP ${res.status}`);
		if (!res.ok) continue;
		const status = await res.json();
		if (status.status === 'completed') {
			const dl = typeof status.job_result === 'string'
				? status.job_result
				: status.job_result?.url || status.result?.url;
			if (dl) return dl;
			throw new Error(`completed without URL: ${JSON.stringify(status).slice(0, 200)}`);
		}
		if (status.status === 'failed') {
			throw new Error(`retarget failed: ${JSON.stringify(status.job_result ?? status.message ?? '').slice(0, 120)}`);
		}
	}
	throw new Error('poll timeout');
}

// MotionPack exports arrive as a zip of FBX files — extract each clip into
// animation-sources/ under the same mx-<slug>.fbx convention as single motions.
function extractPack(zipBuf) {
	const tmp = mkdtempSync(join(tmpdir(), 'mixamo-pack-'));
	const files = [];
	try {
		const zipPath = join(tmp, 'pack.zip');
		writeFileSync(zipPath, zipBuf);
		execFileSync('unzip', ['-o', '-q', zipPath, '-d', tmp]);
		for (const rel of readdirSync(tmp, { recursive: true })) {
			if (!String(rel).toLowerCase().endsWith('.fbx')) continue;
			const base = String(rel).split('/').pop().replace(/\.fbx$/i, '');
			const out = `mx-${slugify(base)}.fbx`;
			const dest = join(SOURCES_DIR, out);
			if (!existsSync(dest)) copyFileSync(join(tmp, rel), dest);
			files.push(out);
		}
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
	return files;
}

async function resolveCharacterId(authHeaders) {
	if (process.env.MIXAMO_CHARACTER_ID) return process.env.MIXAMO_CHARACTER_ID.trim();
	try {
		const res = await rlFetch(`${MIXAMO_API}/characters/primary`, { headers: authHeaders });
		if (res.ok) {
			const d = await res.json();
			const id = d.primary_character_id || d.uuid || d.id;
			if (id) return id;
		}
	} catch { /* fall through to Y-Bot */ }
	return Y_BOT_ID;
}

async function downloadAll(catalog, token) {
	console.log('\n── Phase 2: Download FBX files ───────────────────────────');
	if (!token) {
		console.log('  ⚠️  MIXAMO_TOKEN not set — skipping download phase.');
		console.log('  To get a token: node scripts/get-mixamo-token.mjs');
		return;
	}

	const authHeaders = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`,
		'X-Api-Key': 'mixamo2',
	};

	const characterId = await resolveCharacterId(authHeaders);
	console.log(`  Export character: ${characterId}`);

	// Restrict to this shard's slice of the catalog (interleaved by index).
	const shardCatalog = SHARD.count > 1
		? catalog.filter((_, i) => i % SHARD.count === SHARD.index - 1)
		: catalog;
	if (SHARD.count > 1) {
		console.log(`  Shard ${SHARD.index}/${SHARD.count}: ${shardCatalog.length} of ${catalog.length} clips`);
	}

	const progress = existsSync(PROGRESS_PATH)
		? JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'))
		: {};

	const saveProgress = () => {
		writeFileSync(PROGRESS_PATH + '.tmp', JSON.stringify(progress, null, 2));
		renameSync(PROGRESS_PATH + '.tmp', PROGRESS_PATH);
	};

	const toDownload = shardCatalog.filter((a) => {
		if (progress[a.id]?.status === 'done') {
			// Pack clips are recorded in progress; single motions re-check disk.
			if (a.type === 'MotionPack') return false;
			const outPath = join(SOURCES_DIR, `mx-${slugify(a.name)}.fbx`);
			return !existsSync(outPath);
		}
		if (progress[a.id]?.status === 'perm_fail') return false;
		return true;
	});

	const alreadyDone = shardCatalog.length - toDownload.length;
	console.log(`  Catalog: ${shardCatalog.length} | Already done: ${alreadyDone} | To download: ${Math.min(toDownload.length, MAX_DOWNLOADS)}`);

	let ok = 0, fail = 0;
	let cursor = 0;

	async function downloadOne(anim, idx) {
		const label = `  [${idx + 1 + alreadyDone}/${shardCatalog.length}]`;
		const slug = slugify(anim.name);
		const isPack = anim.type === 'MotionPack';
		const outPath = join(SOURCES_DIR, `mx-${slug}.fbx`);

		try {
			// Get gms_hash export params
			const detailRes = await rlFetch(
				`${MIXAMO_API}/products/${anim.id}?character_id=${characterId}`,
				{ headers: authHeaders },
			);
			if (!detailRes.ok) {
				const code = detailRes.status;
				if (code === 400 || code === 404) {
					progress[anim.id] = { status: 'perm_fail', http: code };
					saveProgress();
				}
				throw new Error(`detail HTTP ${code}`);
			}
			const detail = await detailRes.json();
			const gmsHashes = isPack
				? (detail?.details?.motions ?? [])
						.map((m) => flattenGmsHash(m.gms_hash ?? m.details?.gms_hash))
						.filter(Boolean)
				: [flattenGmsHash(detail?.details?.gms_hash)].filter(Boolean);
			if (!gmsHashes.length) {
				progress[anim.id] = { status: 'perm_fail', reason: 'no_gms_hash' };
				saveProgress();
				throw new Error('no gms_hash');
			}

			// Request export
			const exportRes = await rlFetch(`${MIXAMO_API}/animations/export`, {
				method: 'POST',
				headers: authHeaders,
				body: JSON.stringify({
					character_id: characterId,
					product_id: anim.id,
					product_name: anim.name,
					type: anim.type || 'Motion',
					gms_hash: gmsHashes,
					preferences: { format: 'fbx7', skin: 'false', fps: '30', reducekf: '0' },
				}),
			});
			if (!exportRes.ok) {
				const code = exportRes.status;
				if (code === 400 || code === 404) {
					progress[anim.id] = { status: 'perm_fail', http: code };
					saveProgress();
				}
				throw new Error(`export HTTP ${code}`);
			}

			const dlUrl = await pollForDownloadUrl(anim.id, characterId, authHeaders);

			// Download file
			const fileRes = await rlFetch(dlUrl);
			if (!fileRes.ok) throw new Error(`file download HTTP ${fileRes.status}`);
			const buf = Buffer.from(await fileRes.arrayBuffer());

			if (isPack) {
				const files = extractPack(buf);
				progress[anim.id] = { status: 'done', files, bytes: buf.length };
				saveProgress();
				ok++;
				console.log(`${label} ✅ 📦 ${anim.name} (${files.length} clips, ${(buf.length / 1024).toFixed(0)} KB)`);
			} else {
				writeFileSync(outPath, buf);
				progress[anim.id] = { status: 'done', file: `mx-${slug}.fbx`, bytes: buf.length };
				saveProgress();
				ok++;
				console.log(`${label} ✅ ${anim.name} (${(buf.length / 1024).toFixed(0)} KB)`);
			}
			await sleep(400);
		} catch (err) {
			fail++;
			console.warn(`${label} ❌ ${anim.name}: ${err.message}`);
			if (/HTTP 401|HTTP 403/.test(err.message)) {
				console.error('\n  🛑 Auth error — token expired. Refresh MIXAMO_TOKEN (or re-run: node scripts/get-mixamo-token.mjs) and re-run; progress is saved.');
				process.exit(2);
			}
		}
	}

	async function worker() {
		while (cursor < toDownload.length && ok + fail < MAX_DOWNLOADS) {
			const i = cursor++;
			await downloadOne(toDownload[i], i);
		}
	}

	const t0 = Date.now();
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	const mins = ((Date.now() - t0) / 60_000).toFixed(1);

	console.log(`\n  Downloaded: ${ok} | Failed: ${fail} | Time: ${mins} min`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — INTEGRATE
// ═══════════════════════════════════════════════════════════════════════════
async function integrate(catalog) {
	console.log('\n── Phase 3: Generate library config ──────────────────────');

	// Build a lookup: slug → catalog entry
	const bySlug = new Map(catalog.map((a) => [`mx-${slugify(a.name)}.fbx`, a]));

	// Scan animation-sources/ for mx-*.fbx files. The library config is fully
	// regenerated each run — it is derived data, never hand-edited. The curated
	// scripts/animations.config.json is deliberately not touched.
	const files = readdirSync(SOURCES_DIR).filter((f) => f.startsWith('mx-') && f.endsWith('.fbx'));

	const entries = files
		.map((file) => {
			const anim = bySlug.get(file);
			const label = anim?.name ?? file.replace(/^mx-/, '').replace(/\.fbx$/, '').replace(/-/g, ' ');
			const entry = {
				name: file.replace(/\.fbx$/, ''), // mx-<slug>, unique by construction
				source: file,
				label,
				icon: iconFor(label),
				loop: loopFor(label),
			};
			if (anim?.category) entry.category = anim.category;
			return entry;
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	writeFileSync(LIBRARY_CONFIG_PATH, JSON.stringify(entries, null, 2));
	console.log(`  ✅ ${entries.length} clips → scripts/mixamo-library.config.json`);
	return entries.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — BUILD (library staging, not the curated public set)
// ═══════════════════════════════════════════════════════════════════════════
async function build() {
	console.log('\n── Phase 4: Bake library clips (staging) ──────────────────');
	if (!existsSync(LIBRARY_CONFIG_PATH)) {
		console.log('  ⚠️  No library config — run the integrate phase first.');
		return;
	}
	console.log('  Retargeting library FBX → animation-sources/.library-clips/\n');

	const result = spawnSync(process.execPath, [
		join(__dirname, 'build-animations.mjs'),
		'--config=scripts/mixamo-library.config.json',
		'--out=animation-sources/.library-clips',
		'--manifest=animation-sources/.library-clips/manifest.json',
		// Staged urls are library-root-relative; the upload phase writes the
		// final absolute CDN urls into the published manifest.
		'--url-prefix=clips/',
	], { cwd: ROOT, stdio: 'inherit' });

	if (result.status !== 0) {
		console.error(`\n  ❌ Build failed (exit ${result.status})`);
		process.exit(result.status ?? 1);
	}
	console.log('\n  ✅ Library staging build complete.');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — UPLOAD (R2)
// ═══════════════════════════════════════════════════════════════════════════
async function uploadLibrary() {
	console.log('\n── Phase 5: Upload library to R2 ──────────────────────────');

	// Same env names the production API uses (api/_lib/env.js), with the older
	// R2_* names from earlier scripts accepted as fallback.
	const accountId = loadEnv('R2_ACCOUNT_ID');
	const endpoint = loadEnv('S3_ENDPOINT') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
	const accessKeyId = loadEnv('S3_ACCESS_KEY_ID') || loadEnv('R2_ACCESS_KEY_ID');
	const secretAccessKey = loadEnv('S3_SECRET_ACCESS_KEY') || loadEnv('R2_SECRET_ACCESS_KEY');
	const bucket = loadEnv('S3_BUCKET') || loadEnv('R2_BUCKET');
	const publicDomain = (loadEnv('S3_PUBLIC_DOMAIN') || '').replace(/\/+$/, '');

	if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicDomain) {
		console.log('  ⚠️  Storage creds missing — skipping upload.');
		console.log('  Needs S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_DOMAIN.');
		console.log('  Pull them with: vercel env pull .env.local');
		return;
	}
	if (!existsSync(LIBRARY_MANIFEST_PATH)) {
		console.log('  ⚠️  No staged library (animation-sources/.library-clips/manifest.json) — run the build phase first.');
		return;
	}

	const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
	const { createHash } = await import('node:crypto');
	const client = new S3Client({
		region: 'auto',
		endpoint,
		credentials: { accessKeyId, secretAccessKey },
	});

	const staged = JSON.parse(readFileSync(LIBRARY_MANIFEST_PATH, 'utf8'));
	const state = existsSync(UPLOAD_STATE_PATH) ? JSON.parse(readFileSync(UPLOAD_STATE_PATH, 'utf8')) : {};
	const saveState = () => writeFileSync(UPLOAD_STATE_PATH, JSON.stringify(state, null, 2));

	let uploaded = 0, skipped = 0, failed = 0;
	const clips = [];
	const queue = [...staged];

	async function worker() {
		while (queue.length) {
			const entry = queue.shift();
			const file = join(LIBRARY_STAGE_DIR, `${entry.name}.json`);
			if (!existsSync(file)) { failed++; console.warn(`  ❌ ${entry.name}: staged clip missing`); continue; }
			const body = readFileSync(file);
			const sha = createHash('sha1').update(body).digest('hex');
			const key = `${LIBRARY_R2_PREFIX}/clips/${entry.name}.json`;

			const clipMeta = {
				name: entry.name,
				label: entry.label,
				icon: entry.icon,
				loop: entry.loop !== false,
				...(entry.category ? { category: entry.category } : {}),
				...(entry.duration ? { duration: entry.duration } : {}),
				bytes: body.length,
				url: `${publicDomain}/${key}`,
			};

			if (state[entry.name] === sha) {
				skipped++;
				clips.push(clipMeta);
				continue;
			}
			try {
				await client.send(new PutObjectCommand({
					Bucket: bucket,
					Key: key,
					Body: body,
					ContentType: 'application/json',
					CacheControl: 'public, max-age=86400',
				}));
				state[entry.name] = sha;
				uploaded++;
				clips.push(clipMeta);
				if (uploaded % 25 === 0) { saveState(); process.stdout.write(`\r  ${uploaded} uploaded, ${skipped} unchanged…`); }
			} catch (err) {
				failed++;
				console.warn(`\n  ❌ ${entry.name}: ${err.message}`);
			}
		}
	}
	await Promise.all(Array.from({ length: 8 }, worker));
	saveState();

	clips.sort((a, b) => a.name.localeCompare(b.name));
	const manifest = {
		generated_at: new Date().toISOString(),
		total: clips.length,
		clips,
	};
	await client.send(new PutObjectCommand({
		Bucket: bucket,
		Key: `${LIBRARY_R2_PREFIX}/manifest.json`,
		Body: JSON.stringify(manifest),
		ContentType: 'application/json',
		CacheControl: 'public, max-age=300',
	}));

	console.log(`\n  ✅ Upload: ${uploaded} new/changed, ${skipped} unchanged, ${failed} failed`);
	console.log(`  📋 ${LIBRARY_R2_PREFIX}/manifest.json → ${clips.length} clips live via /api/animations/library`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
	console.log('🎬 Mixamo full pipeline\n');

	const token = loadEnv('MIXAMO_TOKEN');

	if (RUN_DOWNLOAD && !token) {
		console.log('ℹ️  No MIXAMO_TOKEN found. Running catalog + integrate only.');
		console.log('   To download FBX files, add MIXAMO_TOKEN to .env.local');
		console.log('   (get it: node scripts/get-mixamo-token.mjs)\n');
	}

	let catalog = [];

	if (RUN_CATALOG) {
		catalog = await fetchCatalog();
	}

	if (RUN_DOWNLOAD) {
		await downloadAll(catalog, token);
	}

	if (RUN_INTEGRATE) {
		await integrate(catalog);
	}

	if (RUN_BUILD) {
		await build();
	}

	if (RUN_UPLOAD) {
		await uploadLibrary();
	}

	console.log('\n✅ Pipeline complete.');
})().catch((err) => {
	console.error('\n💥', err.message);
	process.exit(1);
});
