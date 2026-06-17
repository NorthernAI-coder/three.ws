// src/irl/load-queue.js — one shared GLTF loader + a priority-ordered, concurrency
// capped async runner for IRL pin avatars.
//
// Before this, every nearby pin spun up its own `new GLTFLoader()` and any pin
// under 80 m raced straight into a load with only a crude `loadedCount < 5`
// guard — no nearest-first ordering, no real cap, no way to cancel a queued load
// when the user walks away. This module fixes both: a single Draco/meshopt-wired
// loader reused across every pin (the decoders init once, not per pin), and a
// generic queue that runs at most `maxActive` jobs at a time, nearest-first.

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dracoLoader } from '../game/avatar-rig.js';
import { getMeshoptDecoder } from '../viewer/internal.js';

let _loader = null;

// One GLTFLoader for the whole IRL scene. Pin avatars come from arbitrary
// `avatar_url`s — pump.fun/Sketchfab exports are commonly Draco-compressed and
// server-baked avatars emit EXT_meshopt_compression — so we wire BOTH decoders.
// Draco is ready synchronously (shared vendored decoder); meshopt resolves async
// and attaches as soon as it's ready, so uncompressed/Draco GLBs never wait on it.
export function sharedGLTFLoader() {
	if (_loader) return _loader;
	_loader = new GLTFLoader();
	_loader.setDRACOLoader(dracoLoader);
	getMeshoptDecoder()
		.then((d) => _loader.setMeshoptDecoder(d))
		.catch(() => { /* meshopt GLBs will fail loudly at load; Draco/plain still work */ });
	return _loader;
}

// Generic priority queue with a concurrency cap. `run(item)` returns a promise;
// jobs start nearest-first via `priorityOf(item)` (lower number = sooner). The
// queue never rejects the caller's promise on cancellation silently — a
// cancelled job rejects with an Error('cancelled') the caller can ignore.
export function createLoadQueue({ run, maxActive = 5, priorityOf = () => 0 }) {
	const queue = [];   // [{ item, resolve, reject, cancelled }]
	let active = 0;
	const cfg = { run, maxActive, priorityOf };

	function pump() {
		// Re-sort on every pump so freshly-updated distances (the user moved) reorder
		// the pending loads before the next slot opens. O(n log n) over a small list.
		if (queue.length > 1) queue.sort((a, b) => cfg.priorityOf(a.item) - cfg.priorityOf(b.item));
		while (active < cfg.maxActive && queue.length) {
			const job = queue.shift();
			if (job.cancelled) continue;
			active++;
			Promise.resolve()
				.then(() => cfg.run(job.item))
				.then(job.resolve, job.reject)
				.finally(() => { active--; pump(); });
		}
	}

	return {
		// Enqueue `item`; resolves with `run(item)`'s result when a slot runs it.
		request(item) {
			return new Promise((resolve, reject) => {
				queue.push({ item, resolve, reject, cancelled: false });
				pump();
			});
		},
		// Drop still-queued jobs matching `pred` (already-running jobs finish).
		// Returns how many were cancelled.
		cancel(pred) {
			let n = 0;
			for (const job of queue) {
				if (!job.cancelled && pred(job.item)) {
					job.cancelled = true;
					job.reject(new Error('cancelled'));
					n++;
				}
			}
			return n;
		},
		// Live-tune the concurrency cap (the perf watchdog lowers it on low-end
		// devices) and immediately pump in case the cap rose.
		setMaxActive(n) { cfg.maxActive = Math.max(1, n | 0); pump(); },
		get active() { return active; },
		get pending() { return queue.reduce((c, j) => c + (j.cancelled ? 0 : 1), 0); },
	};
}
