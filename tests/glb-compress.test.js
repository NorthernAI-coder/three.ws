import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { compressGlb, COMPRESSION_MODES } from '../api/_lib/glb-compress.js';
import { inspectGlb } from '../api/_lib/glb-inspect.js';

const avatar = (name) => resolve(process.cwd(), 'public/avatars', name);
// A real, bundled static mesh — the honest input for a compression round-trip.
const FIXTURE = ['fox.glb', 'mannequin.glb', 'cesium-man.glb'].map(avatar).find(existsSync);

describe('compressGlb', () => {
	it('rejects an unknown mode', async () => {
		await expect(compressGlb(Buffer.alloc(64), { mode: 'zip' })).rejects.toThrow(/unsupported/);
	});

	it('rejects a non-GLB buffer', async () => {
		await expect(compressGlb(Buffer.from('nope'), { mode: 'meshopt' })).rejects.toThrow();
	});

	it.runIf(FIXTURE)(
		'meshopt produces a valid GLB tagged with EXT_meshopt_compression',
		async () => {
			const src = readFileSync(FIXTURE);
			const r = await compressGlb(src, { mode: 'meshopt' });
			expect(r.mode).toBe('meshopt');
			expect(r.outputBytes).toBeGreaterThan(0);
			expect(r.extensionsUsed).toContain('EXT_meshopt_compression');
			// Still a structurally valid binary glTF 2.0.
			const info = inspectGlb(r.buffer);
			expect(info).toBeTruthy();
			expect(info.meshCount).toBeGreaterThan(0);
		},
		60_000,
	);

	it.runIf(FIXTURE)(
		'draco produces a valid GLB tagged with KHR_draco_mesh_compression',
		async () => {
			const src = readFileSync(FIXTURE);
			const r = await compressGlb(src, { mode: 'draco' });
			expect(r.mode).toBe('draco');
			expect(r.extensionsUsed).toContain('KHR_draco_mesh_compression');
			const info = inspectGlb(r.buffer);
			expect(info).toBeTruthy();
			expect(info.meshCount).toBeGreaterThan(0);
		},
		60_000,
	);

	it('advertises exactly the two supported modes', () => {
		expect(COMPRESSION_MODES).toEqual(['draco', 'meshopt']);
	});
});
