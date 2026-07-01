// Studio avatar lane (api/_lib/studio-avatar.js) — the free, self-owned seeder
// engine. Recoloring a rigged Wolf3D/RPM base keeps it a valid, rigged GLB while
// genuinely changing complexion, hair and outfit — deterministically per seed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pickBaseBody, pickColorway, recolorGlb, BASE_BODIES } from '../api/_lib/studio-avatar.js';
import { inspectGlb } from '../api/_lib/glb-inspect.js';

const AV = (f) => resolve(process.cwd(), 'public/avatars', f);

describe('pickBaseBody', () => {
	it('matches the profile gender and is deterministic', () => {
		const p = { gender: 'female' };
		expect(pickBaseBody(p, 'seed-1')).toEqual(pickBaseBody(p, 'seed-1'));
		expect(pickBaseBody(p, 'seed-1').gender).toBe('female');
	});
	it('falls back to the full set for an unknown gender', () => {
		expect(BASE_BODIES).toContainEqual(pickBaseBody({ gender: undefined }, 's'));
	});
});

describe('pickColorway', () => {
	it('is deterministic and maps ethnicity to complexion', () => {
		const p = { gender: 'male', ethnicityKey: 'black-african', grayBias: 0 };
		expect(pickColorway(p, 'k')).toEqual(pickColorway(p, 'k'));
		expect(pickColorway(p, 'k').skin[0]).toBeLessThan(0.6);
	});
	it('gives seniors gray hair when grayBias is high', () => {
		const g = pickColorway({ gender: 'female', ethnicityKey: 'nordic', grayBias: 1 }, 's');
		expect(Math.abs(g.hair[0] - g.hair[2])).toBeLessThan(0.1);
		expect(g.hair[0]).toBeGreaterThan(0.5);
	});
	it('never gives identical top and bottom', () => {
		for (let i = 0; i < 30; i++) {
			const c = pickColorway({ gender: 'male', ethnicityKey: 'latino' }, `m-${i}`);
			expect(c.top).not.toEqual(c.bottom);
		}
	});
});

describe('recolorGlb', () => {
	it('keeps every base body a valid, rigged GLB with the skeleton intact', () => {
		for (const body of BASE_BODIES) {
			const glb = readFileSync(AV(body.file));
			const before = inspectGlb(glb);
			const cw = pickColorway({ gender: body.gender, ethnicityKey: 'south-asian' }, body.id);
			const { buffer, recolored } = recolorGlb(glb, cw);
			const after = inspectGlb(buffer);
			expect(after?.valid).toBe(true);
			expect(after?.isRigged).toBe(true);
			expect(after?.skeletonJointCount).toBe(before?.skeletonJointCount);
			expect(recolored).toContain('Wolf3D_Skin');
		}
	});
	it('writes the requested complexion onto the skin material', () => {
		const glb = readFileSync(AV('realistic-female.glb'));
		const cw = pickColorway({ gender: 'female', ethnicityKey: 'black-african' }, 'x');
		const { buffer } = recolorGlb(glb, cw);
		const gltf = JSON.parse(buffer.slice(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
		const skin = gltf.materials.find((m) => m.name === 'Wolf3D_Skin');
		expect(skin.pbrMetallicRoughness.baseColorFactor.slice(0, 3)).toEqual(cw.skin);
	});
	it('rejects non-GLB input', () => {
		expect(() => recolorGlb(Buffer.from('not a glb'), pickColorway({}, 's'))).toThrow();
	});
});
