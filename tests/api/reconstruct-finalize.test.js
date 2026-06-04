// Unit tests for the shared selfie → 3D finalize stage: the rig-or-materialize
// decision, the auto-rig chain, and the never-empty-handed fallbacks. Providers
// and storage are mocked so the control flow is exercised without live ML.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks ──────────────────────────────────────────────────────────────────
const sqlMock = vi.fn(async () => []);
vi.mock('../../api/_lib/db.js', () => ({ sql: (...args) => sqlMock(...args) }));

const putObjectMock = vi.fn(async () => undefined);
const publicUrlMock = vi.fn((key) => `https://cdn.test/${key}`);
vi.mock('../../api/_lib/r2.js', () => ({
	putObject: (...a) => putObjectMock(...a),
	publicUrl: (...a) => publicUrlMock(...a),
}));

const createAvatarMock = vi.fn(async ({ input }) => ({ id: 'avatar-1', name: input.name, slug: input.slug }));
vi.mock('../../api/_lib/avatars.js', () => ({
	storageKeyFor: ({ userId, slug }) => `u/${userId}/${slug}/m.glb`,
	createAvatar: (...a) => createAvatarMock(...a),
}));

const inspectGlbMock = vi.fn();
vi.mock('../../api/_lib/glb-inspect.js', () => ({
	inspectGlb: (...a) => inspectGlbMock(...a),
	isValidGlbHeader: () => true,
}));

vi.mock('../../api/_lib/webhook-dispatch.js', () => ({ dispatchWebhooks: async () => {} }));

const providerMock = { name: 'replicate', instance: null };
vi.mock('../../api/_lib/regen-provider.js', () => ({
	getRegenProvider: async () => providerMock,
}));

const { finalizeReconstructStage, pollRiggingStage } = await import('../../api/_lib/reconstruct-finalize.js');

const RIGGED = { isRigged: true, skinCount: 1, skeletonJointCount: 30, nodeCount: 40, meshCount: 1, animationCount: 0, generator: 'test' };
const UNRIGGED = { isRigged: false, skinCount: 0, skeletonJointCount: 0, nodeCount: 2, meshCount: 1, animationCount: 0, generator: 'test' };

function mockFetchGlb() {
	global.fetch = vi.fn(async () => ({
		ok: true,
		headers: { get: () => '1024' },
		arrayBuffer: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer,
	}));
}

const baseJob = { provider: 'replicate', params: { name: 'Me', visibility: 'private' } };

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchGlb();
	providerMock.instance = null;
});

describe('finalizeReconstructStage', () => {
	it('materializes immediately when the mesh is already rigged', async () => {
		inspectGlbMock.mockReturnValue(RIGGED);
		const out = await finalizeReconstructStage({ userId: 'u1', jobId: 'j1', job: baseJob, glbUrl: 'https://x/m.glb' });
		expect(out).toEqual({ status: 'done', resultAvatarId: 'avatar-1' });
		expect(createAvatarMock).toHaveBeenCalledOnce();
		// No 'unrigged' tag on a rigged mesh.
		expect(createAvatarMock.mock.calls[0][0].input.tags).not.toContain('unrigged');
	});

	it('materializes unrigged (tagged) when no rig model is configured', async () => {
		inspectGlbMock.mockReturnValue(UNRIGGED);
		providerMock.instance = { supportsMode: () => false }; // rerig unavailable
		const out = await finalizeReconstructStage({ userId: 'u1', jobId: 'j1', job: baseJob, glbUrl: 'https://x/m.glb' });
		expect(out.status).toBe('done');
		expect(createAvatarMock.mock.calls[0][0].input.tags).toContain('unrigged');
	});

	it('chains an auto-rig job when the mesh is unrigged and a rig model exists', async () => {
		inspectGlbMock.mockReturnValue(UNRIGGED);
		const submit = vi.fn(async () => ({ extJobId: 'rig-ext-1' }));
		providerMock.instance = { supportsMode: (m) => m === 'rerig', submit };
		const out = await finalizeReconstructStage({ userId: 'u1', jobId: 'j1', job: baseJob, glbUrl: 'https://x/m.glb' });
		expect(out).toEqual({ status: 'rigging' });
		expect(submit).toHaveBeenCalledOnce();
		expect(submit.mock.calls[0][0].mode).toBe('rerig');
		// Bare mesh stored so the rig model can fetch it, but NO avatar yet.
		expect(putObjectMock).toHaveBeenCalled();
		expect(createAvatarMock).not.toHaveBeenCalled();
	});

	it('falls back to delivering the bare mesh if the rig job cannot be submitted', async () => {
		inspectGlbMock.mockReturnValue(UNRIGGED);
		providerMock.instance = { supportsMode: () => true, submit: vi.fn(async () => { throw new Error('rig down'); }) };
		const out = await finalizeReconstructStage({ userId: 'u1', jobId: 'j1', job: baseJob, glbUrl: 'https://x/m.glb' });
		expect(out.status).toBe('done');
		expect(createAvatarMock.mock.calls[0][0].input.tags).toContain('unrigged');
	});
});

describe('pollRiggingStage', () => {
	const rigJob = {
		provider: 'replicate',
		params: { name: 'Me', visibility: 'private', rig: { extJobId: 'rig-ext-1', storageKey: 'u/u1/selfie-x/m.glb', slug: 'selfie-x', unriggedUrl: 'https://cdn.test/bare.glb' } },
	};

	it('materializes the rigged GLB when the rig job completes', async () => {
		inspectGlbMock.mockReturnValue(RIGGED);
		providerMock.instance = { status: vi.fn(async () => ({ status: 'done', resultGlbUrl: 'https://x/rigged.glb' })) };
		const out = await pollRiggingStage({ userId: 'u1', jobId: 'j1', job: rigJob });
		expect(out).toEqual({ status: 'done', resultAvatarId: 'avatar-1' });
		expect(createAvatarMock.mock.calls[0][0].input.source_meta.rigged).toBe(true);
	});

	it('falls back to the bare mesh when the rig job fails', async () => {
		inspectGlbMock.mockReturnValue(UNRIGGED);
		providerMock.instance = { status: vi.fn(async () => ({ status: 'failed', error: 'rig oom' })) };
		const out = await pollRiggingStage({ userId: 'u1', jobId: 'j1', job: rigJob });
		expect(out.status).toBe('done');
		expect(createAvatarMock.mock.calls[0][0].input.tags).toContain('unrigged');
	});

	it('stays in rigging while the rig job is still running', async () => {
		providerMock.instance = { status: vi.fn(async () => ({ status: 'running' })) };
		const out = await pollRiggingStage({ userId: 'u1', jobId: 'j1', job: rigJob });
		expect(out).toEqual({ status: 'rigging' });
		expect(createAvatarMock).not.toHaveBeenCalled();
	});
});
