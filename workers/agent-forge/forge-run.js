// forge-run.js — drive ONE text→3D generation on the FREE NVIDIA NIM (Microsoft
// TRELLIS) lane and report each real pipeline stage as it happens.
//
// This is the same zero-cost lane the `forge_free` MCP tool and the /forge web
// page use: POST /api/forge with backend:'nvidia', path:'image' (no payment, no
// key), then poll /api/forge?job=<id> to a terminal state. No fabricated
// progress — every onStage() call is fed by a real job/poll response.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shape(data, base) {
	const glbUrl = data.glb_url;
	return {
		glbUrl,
		viewerUrl: `${base}/viewer?src=${encodeURIComponent(glbUrl)}`,
		tier: data.tier || null,
		backend: data.backend || null,
		durable: Boolean(data.durable),
	};
}

// Run a single forge. Calls onStage(state) on each distinct real state, where
// `state` is the raw /api/forge response ({ status, eta_seconds, … }). Resolves
// to { glbUrl, viewerUrl, tier, backend, durable } or throws a holder-readable
// Error. `budgetMs` bounds the total poll time; `pollMs` is the interval.
export async function runForge({
	base,
	prompt,
	tier = 'draft',
	onStage,
	budgetMs = 180_000,
	pollMs = 3_000,
	fetchImpl = fetch,
}) {
	onStage?.({ status: 'submitting' });

	let submitRes;
	try {
		submitRes = await fetchImpl(`${base}/api/forge`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Pin the free NVIDIA NIM (TRELLIS) lane — the only zero-cost path.
			body: JSON.stringify({ prompt, tier, backend: 'nvidia', path: 'image' }),
		});
	} catch (err) {
		throw new Error(`free 3D lane unreachable: ${err?.message || err}`);
	}
	const submit = await submitRes.json().catch(() => ({}));
	if (submitRes.status === 503) throw new Error(submit.message || 'the free 3D lane is not configured on this deployment');
	if (submitRes.status === 429) throw new Error(submit.message || 'free 3D lane busy — try again shortly');

	// NVCF can finish inside the submit window — accept a synchronous done.
	if (submit.status === 'done' && submit.glb_url) {
		onStage?.({ status: 'done' });
		return shape(submit, base);
	}
	if (!submitRes.ok || !submit.job_id) {
		throw new Error(submit.message || `forge returned ${submitRes.status}`);
	}

	onStage?.({ status: 'queued', eta_seconds: submit.eta_seconds });

	const deadline = Date.now() + budgetMs;
	let lastStatus = 'queued';
	while (Date.now() < deadline) {
		await sleep(pollMs);
		let res;
		try {
			res = await fetchImpl(`${base}/api/forge?job=${encodeURIComponent(submit.job_id)}`, {
				headers: { accept: 'application/json' },
			});
		} catch {
			continue; // transient network blip — keep polling within the budget
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			if (res.status >= 500) continue;
			throw new Error(data.message || `forge poll returned ${res.status}`);
		}
		if (data.status && data.status !== lastStatus) {
			lastStatus = data.status;
			onStage?.(data);
		}
		if (data.status === 'done' && data.glb_url) return shape(data, base);
		if (data.status === 'failed') throw new Error(data.error || 'generation failed');
	}
	throw new Error(`generation did not finish within ${Math.round(budgetMs / 1000)}s`);
}
