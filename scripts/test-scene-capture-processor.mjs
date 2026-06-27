#!/usr/bin/env node
// Manual smoke test for the Scene Capture Video Queue Processor.
//
// Drives the real run() against the live DB + Solana + GPU worker — no mocks.
// Exercises the same path the autonomous loop invokes, then prints the outcome,
// the affected scene_capture_queue rows, and the most recent x402_autonomous_log
// entry so you can confirm a row was recorded and the value stored.
//
// Usage:
//   # enqueue a video then process it (pays $0.01, submits to the GPU worker)
//   node scripts/test-scene-capture-processor.mjs --enqueue https://host/clip.mp4
//
//   # just run one processing tick over whatever is already queued
//   node scripts/test-scene-capture-processor.mjs
//
// Requires (degrades gracefully when missing): DATABASE_URL, the x402 seed
// wallet (X402_SEED_SOLANA_SECRET_BASE58 / X402_AGENT_SOLANA_SECRET_BASE58),
// X402_ASSET_MINT_SOLANA + SOLANA_RPC_URL, and GCP_VIDEO2SCENE_URL +
// GCP_RECONSTRUCTION_KEY for the GPU worker.

import { randomUUID } from 'node:crypto';
import { sql } from '../api/_lib/db.js';
import {
	runSceneCaptureProcessor,
	enqueueSceneCapture,
	SCENE_CAPTURE_ENDPOINT,
} from '../api/_lib/x402/scene-capture-processor.js';

function arg(flag) {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
	const enqueueUrl = arg('--enqueue');
	if (enqueueUrl) {
		const id = await enqueueSceneCapture({ videoUrl: enqueueUrl, params: { fps: 8 }, enqueuedBy: 'manual-test' });
		console.log(`enqueued scene_capture_queue row #${id} for ${enqueueUrl}`);
	}

	console.log(`\nrunning processor (metering endpoint: ${SCENE_CAPTURE_ENDPOINT}) …\n`);
	const outcome = await runSceneCaptureProcessor({});
	console.log('run() outcome:');
	console.dir(outcome, { depth: 6 });

	// Demonstrate the recording the autonomous loop performs for every run() —
	// the loop owns this insert in production; here we replicate it so the manual
	// test can confirm a row lands with the extracted value in signal_data.
	const runId = randomUUID();
	try {
		await sql`
			INSERT INTO x402_autonomous_log
				(run_id, endpoint_type, service_name, endpoint_url, network,
				 amount_atomic, asset, tx_signature, response_data, signal_data,
				 duration_ms, success, error_msg, pipeline)
			VALUES
				(${runId}, 'self', 'Scene Capture Video Queue Processor',
				 ${SCENE_CAPTURE_ENDPOINT}, 'solana:mainnet',
				 ${outcome.amountAtomic || 0}, ${process.env.X402_ASSET_MINT_SOLANA || null},
				 ${outcome.txSig || null},
				 ${outcome.responseData ? JSON.stringify(outcome.responseData) : null},
				 ${outcome.signalData ? JSON.stringify(outcome.signalData) : null},
				 ${0}, ${outcome.success ?? false}, ${outcome.errorMsg || null}, 'self')
		`;
		console.log(`\nrecorded x402_autonomous_log row (run_id=${runId})`);
	} catch (err) {
		console.warn(`\ncould not record log row: ${err?.message}`);
	}

	const queue = await sql`
		SELECT id, status, job_id, result_url, num_points, frames, tx_signature, amount_atomic, error_msg, updated_at
		  FROM scene_capture_queue ORDER BY updated_at DESC LIMIT 5
	`.catch((e) => { console.warn('queue read failed:', e?.message); return []; });
	console.log('\nscene_capture_queue (latest 5):');
	console.table(queue);

	const logRows = await sql`
		SELECT service_name, amount_atomic, tx_signature, success, error_msg, signal_data, ts
		  FROM x402_autonomous_log
		 WHERE service_name = 'Scene Capture Video Queue Processor'
		 ORDER BY ts DESC LIMIT 3
	`.catch(() => []);
	console.log('\nx402_autonomous_log (latest 3 for this pipeline):');
	console.dir(logRows, { depth: 6 });
}

main().then(() => process.exit(0)).catch((err) => {
	console.error('manual test failed:', err);
	process.exit(1);
});
