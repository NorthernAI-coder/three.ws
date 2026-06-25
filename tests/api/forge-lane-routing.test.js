// Health-aware self-host routing + cold-start ETA + free/paid cost class.
//
// The self-host GPU lanes (our own Cloud Run workers) are the resilient default:
// routing prefers a HEALTHY self-host lane, then another healthy free lane, and
// only the paid Replicate default when every free lane is confirmed down. These
// tests drive the PURE resolver with an injected health map (no network), plus the
// cold-start ETA helper and the free-vs-paid cost classifier.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	freeLaneCandidates,
	resolveBackendId,
	resolveBackendIdWithHealth,
	defaultBackendForHealthAware,
	estimateEtaSeconds,
	coldStartSecondsFor,
	backendCostClass,
	isSelfHostBackend,
	isFreeBackend,
	DEFAULT_BACKEND_FOR_PATH,
} from '../../api/_lib/forge-tiers.js';

const ALL_LANE_VARS = [
	'MODEL_TRELLIS_URL',
	'GCP_HUNYUAN3D_URL',
	'GCP_TRIPOSG_URL',
	'GCP_RECONSTRUCTION_KEY',
	'HF_TOKEN',
	'NVIDIA_API_KEY',
	'REPLICATE_API_TOKEN',
];
const saved = {};

function configureAllLanes() {
	process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
	process.env.GCP_HUNYUAN3D_URL = 'https://hunyuan.example.run.app';
	process.env.GCP_TRIPOSG_URL = 'https://triposg.example.run.app';
	process.env.GCP_RECONSTRUCTION_KEY = 'secret';
	process.env.HF_TOKEN = 'hf_test';
	process.env.NVIDIA_API_KEY = 'nvapi-test';
	process.env.REPLICATE_API_TOKEN = 'r8_test';
}

beforeEach(() => {
	for (const v of ALL_LANE_VARS) {
		saved[v] = process.env[v];
		delete process.env[v];
	}
});
afterEach(() => {
	for (const v of ALL_LANE_VARS) {
		if (saved[v] === undefined) delete process.env[v];
		else process.env[v] = saved[v];
	}
});

describe('freeLaneCandidates — ordered, configured, de-duplicated', () => {
	it('orders our own GPU workers ahead of the free external lane for photos', () => {
		configureAllLanes();
		// Photo: NVIDIA's text-only preview is excluded; self-host workers lead.
		expect(freeLaneCandidates('image', 'draft', true)).toEqual([
			'trellis_selfhost',
			'hunyuan3d',
			'huggingface',
		]);
	});

	it('keeps the native NVIDIA text→3D default first for text prompts', () => {
		configureAllLanes();
		// Text (userImages=false): the tier-named native lane leads, then self-host.
		expect(freeLaneCandidates('image', 'draft', false)).toEqual([
			'nvidia',
			'trellis_selfhost',
			'hunyuan3d',
			'huggingface',
		]);
	});

	it('drops unconfigured lanes and never duplicates one that is both named and a fallback', () => {
		// Only the self-host TRELLIS worker is wired.
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		expect(freeLaneCandidates('image', 'standard', true)).toEqual(['trellis_selfhost']);
		expect(freeLaneCandidates('image', 'standard', false)).toEqual(['trellis_selfhost']);
	});
});

describe('resolveBackendIdWithHealth — prefer healthy self-host → other free → paid', () => {
	beforeEach(configureAllLanes);

	it('routes a photo to the healthy self-host TRELLIS worker', () => {
		const health = { trellis_selfhost: 'ok', hunyuan3d: 'ok', huggingface: 'ok' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health })).toBe(
			'trellis_selfhost',
		);
	});

	it('skips a down self-host lane and falls to the next healthy self-host worker', () => {
		const health = { trellis_selfhost: 'down', hunyuan3d: 'ok', huggingface: 'ok' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health })).toBe(
			'hunyuan3d',
		);
	});

	it('falls to the healthy free external lane when both self-host workers are down', () => {
		const health = { trellis_selfhost: 'down', hunyuan3d: 'down', huggingface: 'ok' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health })).toBe(
			'huggingface',
		);
	});

	it('falls to the paid standing default only when every free lane is confirmed down', () => {
		const health = { trellis_selfhost: 'down', hunyuan3d: 'down', huggingface: 'down' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health })).toBe(
			DEFAULT_BACKEND_FOR_PATH.image,
		);
		expect(DEFAULT_BACKEND_FOR_PATH.image).toBe('trellis');
	});

	it('treats unknown/degraded health as usable (never blocks on missing telemetry)', () => {
		// trellis_selfhost has no entry (unknown) → still picked, ahead of an ok HF.
		const health = { huggingface: 'ok' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health })).toBe(
			'trellis_selfhost',
		);
		// A degraded self-host lane is skipped only if a later candidate is ok.
		const health2 = { trellis_selfhost: 'degraded', hunyuan3d: 'ok' };
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true, health: health2 })).toBe(
			'hunyuan3d',
		);
	});

	it('prefers the native NVIDIA lane for healthy text, then self-host when it is down', () => {
		expect(
			resolveBackendIdWithHealth({ path: 'image', tier: 'draft', userImages: false, health: { nvidia: 'ok' } }),
		).toBe('nvidia');
		expect(
			resolveBackendIdWithHealth({
				path: 'image',
				tier: 'draft',
				userImages: false,
				health: { nvidia: 'down', trellis_selfhost: 'ok' },
			}),
		).toBe('trellis_selfhost');
	});

	it('honors an explicitly named backend regardless of health', () => {
		const health = { trellis_selfhost: 'ok' };
		expect(
			resolveBackendIdWithHealth({ path: 'image', tier: 'standard', backend: 'meshy', userImages: true, health }),
		).toBe('meshy');
	});

	it('with no health map, matches the env-only resolver exactly', () => {
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'standard', userImages: true })).toBe(
			resolveBackendId({ path: 'image', tier: 'standard', userImages: true }),
		);
		expect(resolveBackendIdWithHealth({ path: 'image', tier: 'draft', userImages: false })).toBe(
			resolveBackendId({ path: 'image', tier: 'draft', userImages: false }),
		);
	});

	it('routes sketch to the self-host TripoSG worker, paid never selected', () => {
		expect(
			defaultBackendForHealthAware('sketch', 'standard', true, { triposg: 'ok' }),
		).toBe('triposg');
		// Down → the path has no other free lane, so the standing sketch default.
		expect(defaultBackendForHealthAware('sketch', 'standard', true, { triposg: 'down' })).toBe(
			DEFAULT_BACKEND_FOR_PATH.sketch,
		);
	});
});

describe('cold-start ETA — honest widening for scale-to-zero workers', () => {
	it('adds the self-host worker cold-start budget only when cold', () => {
		const warm = estimateEtaSeconds({ backendId: 'trellis_selfhost', tier: 'standard' });
		const cold = estimateEtaSeconds({ backendId: 'trellis_selfhost', tier: 'standard', cold: true });
		expect(coldStartSecondsFor('trellis_selfhost')).toBeGreaterThan(0);
		expect(cold).toBe(warm + coldStartSecondsFor('trellis_selfhost'));
	});

	it('is a no-op for an always-warm external/paid lane', () => {
		expect(coldStartSecondsFor('huggingface')).toBe(0);
		expect(estimateEtaSeconds({ backendId: 'huggingface', tier: 'standard', cold: true })).toBe(
			estimateEtaSeconds({ backendId: 'huggingface', tier: 'standard' }),
		);
	});
});

describe('cost class — free (self-host + free external) vs paid', () => {
	it('classifies our self-host GPU workers and free previews as free', () => {
		for (const id of ['trellis_selfhost', 'hunyuan3d', 'triposg', 'nvidia', 'huggingface']) {
			expect(isFreeBackend(id)).toBe(true);
			expect(backendCostClass(id)).toBe('free');
		}
		expect(isSelfHostBackend('trellis_selfhost')).toBe(true);
		expect(isSelfHostBackend('hunyuan3d')).toBe(true);
		expect(isSelfHostBackend('triposg')).toBe(true);
	});

	it('classifies the paid platform lane and BYOK vendors as paid', () => {
		for (const id of ['trellis', 'meshy', 'tripo', 'rodin', 'stability']) {
			expect(backendCostClass(id)).toBe('paid');
		}
		expect(isSelfHostBackend('trellis')).toBe(false);
		expect(isSelfHostBackend('meshy')).toBe(false);
	});
});
