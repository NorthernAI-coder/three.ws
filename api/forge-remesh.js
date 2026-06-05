/**
 * /api/forge-remesh — mesh processing for the forge pipeline.
 *
 *   POST /api/forge-remesh  {
 *     mesh_url: string,
 *     operation?: "full"|"simplify"|"repair"|"convert",
 *     target_faces?: number,
 *     output_format?: "glb"|"obj"|"stl"|"ply"|"usdz"|"3mf"
 *   } → 202 { job_id, status }
 *
 *   GET  /api/forge-remesh?job=<id>
 *     → { job_id, status, result_url?, face_count?, error? }
 *
 * Routes to workers/remesh (GCP Cloud Run) when GCP_REMESH_URL is set.
 */

import { cors, json, method, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { createRegenProvider } from './_providers/gcp.js';

const JOB_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;
const VALID_OPERATIONS = new Set(['full', 'simplify', 'repair', 'convert']);
const VALID_FORMATS = new Set(['glb', 'obj', 'stl', 'ply', 'usdz', '3mf']);

function unconfigured(res) {
	return json(res, 503, {
		error: 'unconfigured',
		message:
			'Mesh processing is not configured. Set GCP_REMESH_URL and GCP_RECONSTRUCTION_KEY ' +
			'to the URL and bearer secret of your deployed workers/remesh Cloud Run service.',
	});
}

async function startJob(req, res) {
	const ip = clientIp(req);
	const rl = await limits.mcp3dGenerate(ip);
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	const body = await readJson(req, 4_000).catch(() => null);
	const meshUrl = typeof body?.mesh_url === 'string' ? body.mesh_url.trim() : '';
	if (!meshUrl.startsWith('https://')) {
		return json(res, 400, { error: 'invalid_mesh_url', message: 'mesh_url must be a public https URL.' });
	}

	const operation = VALID_OPERATIONS.has(body?.operation) ? body.operation : 'full';
	const outputFormat = VALID_FORMATS.has(body?.output_format) ? body.output_format : 'glb';
	const targetFaces = Math.max(1_000, Math.min(500_000, Number(body?.target_faces) || 50_000));

	let provider;
	try {
		provider = createRegenProvider();
		if (!provider.supportsMode('remesh')) return unconfigured(res);
	} catch {
		return unconfigured(res);
	}

	try {
		const job = await provider.submit({
			mode: 'remesh',
			sourceUrl: meshUrl,
			params: { operation, target_faces: targetFaces, output_format: outputFormat },
		});
		return json(res, 202, {
			job_id: job.extJobId,
			status: 'queued',
			operation,
			output_format: outputFormat,
			eta_seconds: job.eta,
		});
	} catch (err) {
		return json(res, 502, { error: 'remesh_failed', message: err?.message || 'Mesh processing could not start.' });
	}
}

async function pollJob(req, res, jobId) {
	if (!JOB_ID_RE.test(jobId)) {
		return json(res, 400, { error: 'invalid_job', message: 'Malformed job id.' });
	}

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return json(res, 429, { error: 'rate_limited', retry_after: Math.ceil((rl.reset - Date.now()) / 1000) });
	}

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	const result = await provider.status(jobId);
	return json(res, 200, {
		job_id: jobId,
		status: result.status,
		result_url: result.resultGlbUrl || null,
		face_count: result.faceCount || null,
		error: result.error || null,
	});
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	if (req.method === 'POST') return startJob(req, res);

	const url = new URL(req.url, 'http://localhost');
	const jobId = (url.searchParams.get('job') || '').trim();
	if (!jobId) return json(res, 400, { error: 'missing_job', message: 'Pass ?job=<id> to poll.' });
	return pollJob(req, res, jobId);
});
