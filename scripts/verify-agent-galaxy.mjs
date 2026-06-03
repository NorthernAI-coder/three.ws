#!/usr/bin/env node
// Verifies the IBM Granite Agent Galaxy pipeline end to end.
//
//   Phase 1 (offline, deterministic): fabricates three clearly-separated agent
//   "themes" as high-dimensional vectors, runs the exact production pipeline —
//   L2-normalise → projectTo3D (PCA) → kmeans → cosine search — and asserts the
//   geometry is faithful: same-theme agents land near each other in 3D, k-means
//   recovers the three themes one-to-one, and a themed query ranks its own theme
//   to the top. No network, never flaky.
//
//   Phase 2 (live, best-effort): if watsonx credentials are present, embeds a
//   handful of real sentences on IBM Granite and asserts (a) the model returns
//   non-empty equal-length vectors and (b) two semantically-related sentences
//   are more cosine-similar than two unrelated ones — i.e. the embedding space
//   the galaxy relies on is actually meaningful. SKIPPED (not failed) with no
//   credentials; Phase 1 already proves the layout math.
//
//   node scripts/verify-agent-galaxy.mjs
//   # live phase needs: WATSONX_API_KEY + WATSONX_PROJECT_ID (or WATSONX_SPACE_ID)
//   # pull them with:  vercel env pull .env.local
//   #                  node --env-file=.env.local scripts/verify-agent-galaxy.mjs
//
// Exits non-zero only if Phase 1 fails.

import {
	makeRng,
	unit,
	cosineSimilarity,
	projectTo3D,
	kmeans,
	suggestClusterCount,
} from '../api/_lib/embedding-math.js';
import { watsonxConfig, watsonxEmbed } from '../api/_lib/watsonx.js';

function assert(cond, msg) {
	if (!cond) throw new Error(msg);
}

function themedVector(dim, axis, rng, spread = 0.18) {
	const v = new Array(dim).fill(0);
	for (let i = 0; i < dim; i++) v[i] = (rng() - 0.5) * spread;
	v[axis] += 1;
	return v;
}

// ── Phase 1: offline pipeline proof ──────────────────────────────────────────
function phaseOffline() {
	console.log('▸ Phase 1 — offline galaxy pipeline (deterministic)\n');

	const DIMS = 32;
	const AXES = [0, 11, 22]; // three orthogonal "themes"
	const PER = 12;
	const rng = makeRng(2026);
	const vectors = [];
	const labels = [];
	AXES.forEach((axis, theme) => {
		for (let i = 0; i < PER; i++) {
			vectors.push(themedVector(DIMS, axis, rng));
			labels.push(theme);
		}
	});
	const unitVecs = vectors.map(unit);

	// Projection faithfulness: same-theme pairs tighter than cross-theme pairs.
	const coords = projectTo3D(unitVecs, { radius: 100 });
	assert(coords.length === vectors.length, 'projectTo3D must return one point per agent');
	for (const c of coords) {
		assert(c.length === 3 && c.every((v) => Number.isFinite(v)), 'coords must be finite 3-tuples');
		assert(c.every((v) => Math.abs(v) <= 100.001), 'coords must stay within the radius');
	}
	const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
	let intra = 0, intraN = 0, inter = 0, interN = 0;
	for (let i = 0; i < coords.length; i++) {
		for (let j = i + 1; j < coords.length; j++) {
			const dist = d2(coords[i], coords[j]);
			if (labels[i] === labels[j]) { intra += dist; intraN++; } else { inter += dist; interN++; }
		}
	}
	const intraMean = intra / intraN, interMean = inter / interN;
	assert(intraMean < interMean, `projection not faithful: intra ${intraMean.toFixed(1)} !< inter ${interMean.toFixed(1)}`);
	console.log(`  ✓ PCA 3D layout keeps themes apart (intra ${intraMean.toFixed(1)} ≪ inter ${interMean.toFixed(1)})`);

	// Determinism.
	assert(JSON.stringify(projectTo3D(unitVecs, { radius: 100 })) === JSON.stringify(coords), 'projection must be deterministic');
	console.log('  ✓ projection is deterministic (stable layout across rebuilds)');

	// Clustering recovers the three themes one-to-one.
	const k = suggestClusterCount(vectors.length);
	const { assignments, k: realK } = kmeans(unitVecs, 3);
	const mapping = new Map();
	let bijection = true;
	for (let i = 0; i < labels.length; i++) {
		if (!mapping.has(labels[i])) mapping.set(labels[i], assignments[i]);
		else if (mapping.get(labels[i]) !== assignments[i]) bijection = false;
	}
	assert(realK === 3 && bijection && new Set(mapping.values()).size === 3, 'kmeans failed to recover the 3 themes');
	console.log(`  ✓ k-means recovered all 3 themes one-to-one (suggested k for ${vectors.length} agents = ${k})`);

	// Semantic search: a themed query ranks its own theme on top.
	const query = themedVector(DIMS, AXES[1], makeRng(7));
	const ranked = vectors
		.map((v, i) => ({ label: labels[i], score: cosineSimilarity(query, v) }))
		.sort((a, b) => b.score - a.score);
	assert(ranked.slice(0, 5).every((r) => r.label === 1), 'cosine search did not rank the matching theme first');
	console.log(`  ✓ cosine search ranks the matching theme top (top score ${ranked[0].score.toFixed(3)})\n`);
}

// ── Phase 2: live Granite embeddings (best-effort) ───────────────────────────
async function phaseLive() {
	console.log('▸ Phase 2 — live IBM Granite embeddings (best-effort)\n');
	const cfg = watsonxConfig();
	if (!cfg.configured) {
		console.log('  ⓘ no watsonx credentials in env — SKIPPING live phase.');
		console.log('    Phase 1 already proved the projection, clustering, and search math.');
		console.log('    To run live: `vercel env pull .env.local` then');
		console.log('    `node --env-file=.env.local scripts/verify-agent-galaxy.mjs`\n');
		return 'skipped';
	}

	const sentences = [
		'A witty assistant that helps you trade Solana tokens and track your portfolio.',
		'An agent for buying and selling crypto on Solana with market insights.',
		'A calm guide that leads short daily meditation and breathing sessions.',
	];
	const { vectors, dimensions, model } = await watsonxEmbed(cfg, { inputs: sentences });
	assert(vectors.length === sentences.length, 'expected one vector per sentence');
	assert(dimensions > 0 && vectors.every((v) => v?.length === dimensions), 'vectors must be non-empty and equal length');
	console.log(`  ✓ Granite (${model}) returned ${sentences.length} × ${dimensions}-dim vectors`);

	const simCrypto = cosineSimilarity(vectors[0], vectors[1]); // both crypto
	const simCross = cosineSimilarity(vectors[0], vectors[2]);  // crypto vs meditation
	console.log(`    crypto↔crypto cosine ${simCrypto.toFixed(3)} vs crypto↔meditation ${simCross.toFixed(3)}`);
	assert(simCrypto > simCross, 'related sentences should be more similar than unrelated ones');
	console.log('  ✓ embedding space is semantically meaningful — related agents cluster.\n');
	return 'ok';
}

(async () => {
	phaseOffline();
	const live = await phaseLive();
	if (live === 'ok') console.log('✅ Agent Galaxy verified — offline math AND live Granite embeddings.');
	else console.log('✅ Agent Galaxy pipeline verified offline (live phase skipped — no credentials).');
	process.exit(0);
})().catch((err) => {
	console.error('\n✗ verification failed:', err?.message || err);
	process.exit(1);
});
