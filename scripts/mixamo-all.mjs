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
 *     Reads the saved FBX files, cross-references the catalog for human-
 *     readable names, and upserts entries into scripts/animations.config.json.
 *     Picks a sensible icon and loop flag based on the animation category.
 *     Skips entries already in config.
 *
 *   Phase 4 — Build
 *     Runs `npm run build:animations` which retargets every configured clip
 *     to the canonical skeleton and rewrites public/animations/manifest.json.
 *
 * Usage:
 *   node scripts/mixamo-all.mjs              # run all phases
 *   node scripts/mixamo-all.mjs --catalog    # phase 1 only (no auth)
 *   node scripts/mixamo-all.mjs --download   # phases 1+2 (needs MIXAMO_TOKEN)
 *   node scripts/mixamo-all.mjs --integrate  # phases 1+3 (use saved sources)
 *   node scripts/mixamo-all.mjs --build      # phase 4 only
 *   node scripts/mixamo-all.mjs --concurrency=5 --limit=50  # tuning flags
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

const RUN_CATALOG   = flags.catalog   || flags.download || flags.all || (!Object.keys(flags).length);
const RUN_DOWNLOAD  = flags.download  || flags.all       || (!Object.keys(flags).length);
const RUN_INTEGRATE = flags.integrate || flags.all       || (!Object.keys(flags).length);
const RUN_BUILD     = flags.build     || flags.all       || (!Object.keys(flags).length);
// Serial by default — export status comes from the per-character monitor, so
// parallel exports on the same character clobber each other's results.
const CONCURRENCY   = Number(flags.concurrency) || 1;
const MAX_DOWNLOADS = flags.limit ? Number(flags.limit) : Infinity;

// ── Paths ──────────────────────────────────────────────────────────────────
const CATALOG_PATH  = join(__dirname, 'mixamo-catalog.json');
const PROGRESS_PATH = join(__dirname, 'mixamo-progress.json');
const CONFIG_PATH   = join(__dirname, 'animations.config.json');
const SOURCES_DIR   = join(ROOT, 'animation-sources');

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

	const progress = existsSync(PROGRESS_PATH)
		? JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'))
		: {};

	const saveProgress = () => {
		writeFileSync(PROGRESS_PATH + '.tmp', JSON.stringify(progress, null, 2));
		renameSync(PROGRESS_PATH + '.tmp', PROGRESS_PATH);
	};

	const toDownload = catalog.filter((a) => {
		if (progress[a.id]?.status === 'done') {
			// Pack clips are recorded in progress; single motions re-check disk.
			if (a.type === 'MotionPack') return false;
			const outPath = join(SOURCES_DIR, `mx-${slugify(a.name)}.fbx`);
			return !existsSync(outPath);
		}
		if (progress[a.id]?.status === 'perm_fail') return false;
		return true;
	});

	const alreadyDone = catalog.length - toDownload.length;
	console.log(`  Catalog: ${catalog.length} | Already done: ${alreadyDone} | To download: ${Math.min(toDownload.length, MAX_DOWNLOADS)}`);

	let ok = 0, fail = 0;
	let cursor = 0;

	async function downloadOne(anim, idx) {
		const label = `  [${idx + 1 + alreadyDone}/${catalog.length}]`;
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
	console.log('\n── Phase 3: Integrate into animations.config.json ────────');

	// Build a lookup: slug → catalog entry
	const bySlug = new Map(catalog.map((a) => [`mx-${slugify(a.name)}.fbx`, a]));

	// Read existing config
	const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
	const existingNames = new Set(config.map((e) => e.name));
	const existingSources = new Set(config.map((e) => e.source));

	// Scan animation-sources/ for mx-*.fbx files
	const files = readdirSync(SOURCES_DIR).filter((f) => f.startsWith('mx-') && f.endsWith('.fbx'));
	let added = 0;

	for (const file of files) {
		if (existingSources.has(file)) continue;

		const anim = bySlug.get(file);
		const label = anim?.name ?? file.replace(/^mx-/, '').replace(/\.fbx$/, '').replace(/-/g, ' ');
		const baseName = `mx-${slugify(label)}`;

		// Avoid duplicate names
		let name = baseName;
		let suffix = 1;
		while (existingNames.has(name)) name = `${baseName}-${suffix++}`;

		const entry = {
			name,
			source: file,
			label,
			icon: iconFor(label),
			loop: loopFor(label),
		};
		if (anim?.category) entry.category = anim.category;

		config.push(entry);
		existingNames.add(name);
		existingSources.add(file);
		added++;
	}

	if (added > 0) {
		writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
		console.log(`  ✅ Added ${added} entries to animations.config.json (total: ${config.length})`);
	} else {
		console.log(`  No new entries to add (all mx-*.fbx already in config).`);
	}
	return added;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — BUILD
// ═══════════════════════════════════════════════════════════════════════════
async function build() {
	console.log('\n── Phase 4: Build retargeted clips ────────────────────────');
	console.log('  Running: npm run build:animations');
	console.log('  (This retargets all configured FBX/GLB sources to the canonical skeleton)\n');

	const result = spawnSync('npm', ['run', 'build:animations'], {
		cwd: ROOT,
		stdio: 'inherit',
		shell: true,
	});

	if (result.status !== 0) {
		console.error(`\n  ❌ Build failed (exit ${result.status})`);
		process.exit(result.status ?? 1);
	}
	console.log('\n  ✅ Build complete — manifest.json updated.');
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

	console.log('\n✅ Pipeline complete.');
})().catch((err) => {
	console.error('\n💥', err.message);
	process.exit(1);
});
