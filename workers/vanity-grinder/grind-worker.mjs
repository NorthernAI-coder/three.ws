// Worker thread — pure grinding, no secret persistence.
//
// The main thread (grind.mjs) owns all sealing and writing so secret handling
// stays centralized. A worker only receives a target, grinds it to completion in
// the WASM engine, and posts the raw keypair back over the in-process thread
// channel (never to disk, never to a log). It then waits for the next target.
//
// Protocol:
//   main → worker:  { type: 'grind', target }   |   { type: 'stop' }
//   worker → main:  { type: 'ready' }
//                   { type: 'found', target, publicKey, secretKey, attempts, durationMs }
//                   { type: 'progress', attempts }

import { parentPort, workerData } from 'node:worker_threads';
import { grindToCompletion } from './wasm-grind.mjs';

let stop = false;
const PROGRESS_EVERY = 2_000_000; // report roughly every ~80s of single-thread work

parentPort.on('message', (msg) => {
	if (!msg || typeof msg !== 'object') return;
	if (msg.type === 'stop') {
		stop = true;
		return;
	}
	if (msg.type === 'grind') {
		let lastReported = 0;
		const result = grindToCompletion(msg.target, {
			stopRequested: () => stop,
			onProgress: (attempts) => {
				if (attempts - lastReported >= PROGRESS_EVERY) {
					lastReported = attempts;
					parentPort.postMessage({ type: 'progress', attempts: PROGRESS_EVERY, worker: workerData?.index });
				}
			},
		});
		if (stop || !result) {
			parentPort.postMessage({ type: 'aborted', target: msg.target });
			return;
		}
		parentPort.postMessage(
			{
				type: 'found',
				target: msg.target,
				publicKey: result.publicKey,
				secretKey: result.secretKey,
				attempts: result.attempts,
				durationMs: result.durationMs,
			},
			// Transfer the secret-key buffer instead of copying it — one owner at a time.
			[result.secretKey.buffer],
		);
	}
});

parentPort.postMessage({ type: 'ready' });
