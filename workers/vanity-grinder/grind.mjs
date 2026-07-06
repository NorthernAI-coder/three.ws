#!/usr/bin/env node
// Batch vanity grinder — the premium-inventory producer.
//
// Runs a pool of WASM grind workers (one per vCPU) over a target list, SEALS each
// found keypair in-process (api/_lib/vanity-vault.js) BEFORE any write, and
// appends the ENCRYPTED record to an output JSONL (and, when configured, straight
// into the vanity_inventory table). Plaintext keys never touch disk, a log, or
// the network.
//
// RESUMABLE: a checkpoint file records which targets are already done. On restart
// (spot preemption → the MIG relaunches, or Cloud Run Job retry) it skips
// completed targets and continues. SIGTERM (the preemption signal) flushes the
// checkpoint and exits cleanly so no in-flight state is lost — an interrupted
// target simply restarts from scratch (a random search has no resumable inner
// state; expected work is unchanged).
//
// Designed for GCP spot CPU (Cloud Run Job or a GCE spot MIG) but runs anywhere
// with Node — the local dev run that seeds the initial inventory uses the exact
// same code path (see docs/gcp-credits.md).
//
// Config (all via env):
//   OUTPUT_FILE      encrypted JSONL out (default ./out/inventory.jsonl)
//   CHECKPOINT_FILE  resume state       (default ./out/checkpoint.json)
//   SUMMARY_FILE     throughput summary (default ./out/summary.json)
//   TARGETS_FILE     JSON array of {prefix?,suffix?,ignoreCase} (default: built-in list)
//   INCLUDE_5        '1' to include slow 5-char stretch targets
//   IGNORE_CASE      '1' to fold case on prefix targets
//   MAX_FOUND        stop after N addresses (default: all targets)
//   WORKERS          worker count (default: available parallelism)
//   RETENTION_DAYS   ciphertext retention after reveal (default 0 = delete-on-reveal)
//   BATCH_LABEL      label for this run (default: timestamped)
//   RUNNER           'local' | 'cloud-run-job' | 'gce-spot-mig'
//   SHARD_INDEX/SHARD_COUNT  partition the target list across parallel instances
//   WRITE_DB         '1' to upsert into vanity_inventory (needs DATABASE_URL)
//   VANITY_KMS_KEY   (optional) KMS crypto-key resource → envelope encryption
//   WALLET_ENCRYPTION_KEY  the secret-box master key (required unless KMS)

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import os from 'node:os';
import bs58 from 'bs58';

import { defaultTargets, targetId, labelFor } from './targets.mjs';
import { computeRarity } from '../../src/solana/vanity/rarity.js';
import { priceFromRarity } from '../../api/_lib/vanity-inventory-pricing.js';
import { sealSecret, preferredScheme } from '../../api/_lib/vanity-vault.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;

const OUTPUT_FILE = resolve(env.OUTPUT_FILE || join(HERE, 'out', 'inventory.jsonl'));
const CHECKPOINT_FILE = resolve(env.CHECKPOINT_FILE || join(HERE, 'out', 'checkpoint.json'));
const SUMMARY_FILE = resolve(env.SUMMARY_FILE || join(HERE, 'out', 'summary.json'));
const RETENTION_DAYS = Math.max(0, parseInt(env.RETENTION_DAYS || '0', 10) || 0);
const MAX_FOUND = env.MAX_FOUND ? parseInt(env.MAX_FOUND, 10) : Infinity;
const WORKER_COUNT = Math.max(1, parseInt(env.WORKERS || String(os.availableParallelism?.() || os.cpus().length), 10));
const RUNNER = env.RUNNER || 'local';
const BATCH_LABEL = env.BATCH_LABEL || `batch-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const WRITE_DB = env.WRITE_DB === '1' || env.WRITE_DB === 'true';

function loadTargets() {
	let list;
	if (env.TARGETS_FILE && existsSync(resolve(env.TARGETS_FILE))) {
		const raw = JSON.parse(readFileSync(resolve(env.TARGETS_FILE), 'utf8'));
		list = raw.map((t) => ({ ignoreCase: !!t.ignoreCase, ...t, label: t.label || labelFor(t) }));
	} else {
		list = defaultTargets({ include5: env.INCLUDE_5 === '1', ignoreCase: env.IGNORE_CASE === '1' });
	}
	// Shard across parallel instances (a GCE MIG runs N of these).
	const shardCount = Math.max(1, parseInt(env.SHARD_COUNT || '1', 10));
	const shardIndex = Math.max(0, parseInt(env.SHARD_INDEX || '0', 10));
	if (shardCount > 1) list = list.filter((_, i) => i % shardCount === shardIndex);
	return list;
}

function loadCheckpoint() {
	if (existsSync(CHECKPOINT_FILE)) {
		try {
			return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8'));
		} catch {
			/* corrupt checkpoint — start fresh */
		}
	}
	return { batchLabel: BATCH_LABEL, completed: [], found: 0, startedAt: new Date().toISOString() };
}

let checkpoint = loadCheckpoint();
const completed = new Set(checkpoint.completed || []);

function saveCheckpoint() {
	checkpoint.completed = [...completed];
	writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, '\t'));
}

// Append an encrypted record durably (fsync so a preemption can't lose a found key).
function appendEncrypted(record) {
	const fd = openSync(OUTPUT_FILE, 'a');
	try {
		appendFileSync(fd, JSON.stringify(record) + '\n');
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

// Lazily-loaded DB writer (only pulled in when WRITE_DB is set, so a file-only run
// never needs Neon/DATABASE_URL).
let _dbStore = null;
async function dbUpsert(item) {
	if (!WRITE_DB) return;
	if (!_dbStore) _dbStore = await import('../../api/_lib/vanity-inventory-store.js');
	await _dbStore.upsertInventoryItem(item);
}

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = { found: checkpoint.found || 0, totalAttempts: 0, startedAt: performance.now() };

// ── Seal + persist a found keypair (MAIN thread only) ────────────────────────
async function persistFound({ target, publicKey, secretKey, attempts, durationMs }) {
	const rarity = computeRarity({ prefix: target.prefix, suffix: target.suffix, ignoreCase: target.ignoreCase });
	const { priceUsd } = priceFromRarity(rarity);

	// The plaintext bundle — sealed immediately, never written in the clear.
	const secretKeyBase58 = bs58.encode(Buffer.from(secretKey));
	const plaintext = JSON.stringify({
		format: 'keypair',
		address: publicKey,
		secretKeyBase58,
		secretKey: Array.from(secretKey),
	});
	const { ciphertext, scheme } = await sealSecret(plaintext);
	// Scrub the plaintext material from local scope ASAP.
	secretKey.fill(0);

	const record = {
		address: publicKey,
		prefix: target.prefix || null,
		suffix: target.suffix || null,
		ignoreCase: !!target.ignoreCase,
		patternLabel: target.label || labelFor(target),
		format: 'keypair',
		difficultyAttempts: rarity.expectedAttempts,
		rarityBits: rarity.rarityBits,
		rarityTier: rarity.tier,
		rarityScore: rarity.rarityScore,
		priceUsd,
		retentionDays: RETENTION_DAYS,
		secretCiphertext: ciphertext,
		secretScheme: scheme,
		batchLabel: BATCH_LABEL,
		groundAt: new Date().toISOString(),
		attempts,
		foundInMs: Math.round(durationMs),
	};
	appendEncrypted(record);
	await dbUpsert({
		address: record.address,
		prefix: record.prefix,
		suffix: record.suffix,
		ignoreCase: record.ignoreCase,
		patternLabel: record.patternLabel,
		format: record.format,
		difficultyAttempts: record.difficultyAttempts,
		rarityBits: record.rarityBits,
		rarityTier: record.rarityTier,
		rarityScore: record.rarityScore,
		secretCiphertext: ciphertext,
		secretScheme: scheme,
		priceUsd,
		retentionDays: RETENTION_DAYS,
	});

	stats.found += 1;
	checkpoint.found = stats.found;
	completed.add(targetId(target));
	saveCheckpoint();
	// One safe, secret-free progress line.
	console.log(`[grind] found ${record.patternLabel} → ${publicKey} (${attempts.toLocaleString()} attempts, ${Math.round(durationMs)}ms) $${priceUsd} [${scheme}]`);
}

// ── Orchestration ────────────────────────────────────────────────────────────
let stopping = false;
let onStop = null;
const workers = [];

// Abort every worker's in-flight grind. Workers check the stop flag between
// batches (~sub-second) and post 'aborted', letting the run wind down cleanly.
function stopAllWorkers() {
	for (const w of workers) {
		try { w.postMessage({ type: 'stop' }); } catch { /* worker already gone */ }
	}
}

async function main() {
	mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
	// Fail fast if we can't encrypt — never grind keys we can't seal.
	try {
		await sealSecret('preflight');
	} catch (err) {
		console.error(`[grind] FATAL: cannot seal secrets (${err.message}). Set WALLET_ENCRYPTION_KEY (or VANITY_KMS_KEY). Refusing to grind unsealed keys.`);
		process.exit(3);
	}

	const all = loadTargets();
	const pending = all.filter((t) => !completed.has(targetId(t)));
	console.log(`[grind] ${BATCH_LABEL} runner=${RUNNER} scheme=${preferredScheme()} workers=${WORKER_COUNT}`);
	console.log(`[grind] targets: ${all.length} total, ${completed.size} already done, ${pending.length} to grind`);
	if (!pending.length) {
		await writeSummary(all.length);
		console.log('[grind] nothing to do — inventory target list already complete.');
		return;
	}

	let cursor = 0;
	let active = 0;

	await new Promise((resolveAll) => {
		let settled = false;
		const maybeFinish = () => {
			if (settled) return;
			if ((cursor >= pending.length && active === 0) || (stopping && active === 0)) {
				settled = true;
				stopAllWorkers();
				resolveAll();
			}
		};
		// A SIGTERM (spot preemption) sets `stopping` and asks workers to abort; once
		// each in-flight target reports 'aborted' (active hits 0) the run winds down.
		onStop = () => {
			stopAllWorkers();
			maybeFinish();
		};

		const assign = (worker) => {
			if (stopping || cursor >= pending.length || stats.found >= MAX_FOUND) {
				maybeFinish();
				return;
			}
			const target = pending[cursor++];
			active += 1;
			worker.postMessage({ type: 'grind', target });
		};

		for (let i = 0; i < WORKER_COUNT; i++) {
			const worker = new Worker(join(HERE, 'grind-worker.mjs'), { workerData: { index: i } });
			workers.push(worker);
			worker.on('message', async (msg) => {
				if (msg.type === 'ready') {
					assign(worker);
					return;
				}
				if (msg.type === 'progress') {
					stats.totalAttempts += msg.attempts;
					return;
				}
				if (msg.type === 'found') {
					stats.totalAttempts += msg.attempts;
					try {
						await persistFound(msg);
					} catch (err) {
						console.error(`[grind] persist failed for ${msg.publicKey}: ${err.message}`);
					}
					active -= 1;
					if (stats.found >= MAX_FOUND) {
						stopping = true;
						maybeFinish();
						return;
					}
					assign(worker);
					return;
				}
				if (msg.type === 'aborted') {
					active -= 1;
					maybeFinish();
				}
			});
			worker.on('error', (err) => {
				console.error(`[grind] worker error: ${err.message}`);
				active = Math.max(0, active - 1);
				maybeFinish();
			});
		}
	});

	for (const w of workers) await w.terminate();
	await writeSummary(all.length);
}

async function writeSummary(targetCount) {
	const elapsedSec = (performance.now() - stats.startedAt) / 1000;
	const keysPerSec = elapsedSec > 0 ? stats.totalAttempts / elapsedSec : 0;
	const summary = {
		batchLabel: BATCH_LABEL,
		runner: RUNNER,
		workers: WORKER_COUNT,
		scheme: preferredScheme(),
		targetCount,
		found: stats.found,
		totalAttempts: stats.totalAttempts,
		elapsedSec: Math.round(elapsedSec * 100) / 100,
		keysPerSec: Math.round(keysPerSec),
		keysPerSecPerWorker: Math.round(keysPerSec / WORKER_COUNT),
		preempted: stopping && stats.found < targetCount,
		finishedAt: new Date().toISOString(),
	};
	writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, '\t'));
	console.log(`[grind] summary: found ${summary.found}, ${summary.keysPerSec.toLocaleString()} keys/sec (${summary.keysPerSecPerWorker.toLocaleString()}/worker), ${summary.elapsedSec}s`);
	return summary;
}

// Spot preemption: SIGTERM arrives ~30s before shutdown. Flush + exit cleanly.
for (const sig of ['SIGTERM', 'SIGINT']) {
	process.on(sig, () => {
		if (stopping) return;
		console.log(`[grind] ${sig} received — checkpointing and shutting down`);
		stopping = true;
		saveCheckpoint();
		if (onStop) onStop();
	});
}

main().catch((err) => {
	console.error('[grind] fatal:', err);
	process.exit(1);
});
