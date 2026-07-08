// GET /api/fact-check-benchmark — public read of the fact-check accuracy benchmark.
//
// Serves whatever scripts/fact-check-benchmark.mjs last generated at
// data/_generated/fact-check-benchmark.json (score, per-class table, per-
// difficulty table, confusion matrix, run date), plus the static claim-count
// summary from tests/fixtures/fact-check-benchmark.json so the /fact-check page
// always has something honest to render.
//
// Never fabricates a score: when the runner hasn't been executed against this
// environment yet, `ran` is false and `report` is null — the page renders its
// designed "not yet run" empty state instead of a fake number.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cors, json, method, wrap } from './_lib/http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const FIXTURE_PATH = join(REPO, 'tests/fixtures/fact-check-benchmark.json');
const REPORT_PATH = join(REPO, 'data/_generated/fact-check-benchmark.json');
const VERDICT_CLASSES = ['supported', 'contradicted', 'mixed', 'insufficient'];

async function readJsonIfExists(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (err) {
		if (err?.code === 'ENOENT') return null;
		throw err;
	}
}

function summarizeFixture(fixture) {
	if (!fixture || !Array.isArray(fixture.claims)) return null;
	const counts = Object.fromEntries(VERDICT_CLASSES.map((c) => [c, 0]));
	for (const claim of fixture.claims) {
		if (counts[claim.expected_verdict] != null) counts[claim.expected_verdict]++;
	}
	return { total: fixture.claims.length, by_class: counts, version: fixture.version || null };
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const [fixture, report] = await Promise.all([
		readJsonIfExists(FIXTURE_PATH),
		readJsonIfExists(REPORT_PATH),
	]);

	return json(
		res,
		200,
		{
			data: {
				fixture: summarizeFixture(fixture),
				ran: Boolean(report),
				report: report || null,
				claims_source:
					'https://github.com/nirholas/three.ws/blob/main/tests/fixtures/fact-check-benchmark.json',
				runner_source:
					'https://github.com/nirholas/three.ws/blob/main/scripts/fact-check-benchmark.mjs',
			},
		},
		{ 'cache-control': 'public, max-age=300' },
	);
});
