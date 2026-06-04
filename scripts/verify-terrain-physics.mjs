// Headless verification that the Rapier heightfield collider is aligned with
// the rendered terrain surface (terrain.heightAt). Casts vertical rays at
// sample points and compares the physics hit height to the analytic height —
// this proves the row/col convention + scale mapping are correct without WebGL.
//
// Run: node scripts/verify-terrain-physics.mjs

import { createTerrain } from '../src/game/terrain.js';
import { PhysicsWorld, initRapier } from '../src/physics/physics-world.js';

const RAPIER = await initRapier();
const terrain = createTerrain();

// ── 1. Terrain sanity ──────────────────────────────────────────────────────
const n = terrain.points;
let assertFails = 0;
const check = (cond, msg) => {
	if (!cond) {
		console.error('  ✗', msg);
		assertFails++;
	} else {
		console.log('  ✓', msg);
	}
};

console.log('Terrain sanity:');
check(terrain.heights.length === n * n, `heights buffer is ${n}×${n} = ${n * n}`);
check(
	Number.isFinite(terrain.heights[0]) && Number.isFinite(terrain.heights[n * n - 1]),
	'heights are finite',
);
check(
	Math.abs(terrain.heightAt(0, 0)) < 0.05,
	`spawn (0,0) is flat: h=${terrain.heightAt(0, 0).toFixed(3)}`,
);
let maxAbs = 0;
for (const h of terrain.heights) maxAbs = Math.max(maxAbs, Math.abs(h));
check(
	maxAbs <= terrain.amplitude + 1e-3,
	`peak height ${maxAbs.toFixed(2)} ≤ amplitude ${terrain.amplitude}`,
);
check(maxAbs > 0.3, `terrain has real relief (peak ${maxAbs.toFixed(2)}m), not flat`);

// ── 2. Collider ↔ visual alignment ─────────────────────────────────────────
const phys = new PhysicsWorld(RAPIER);
phys.addHeightfield(terrain);
phys.world.step(); // build the query pipeline before ray casts

// Cast a ray straight down from high above each sample point; the hit height
// must match terrain.heightAt within a cell-size tolerance (the collider is
// piecewise-linear between the same samples heightAt interpolates).
const tol = terrain.cellSize * 1.5;
const samples = [
	[0, 0],
	[3, 4],
	[-5, 2],
	[8, -7],
	[-9, -9],
	[11, 0],
	[0, -11],
	[6.5, 6.5],
	[-7.2, 3.3],
];
let worst = 0;
console.log('\nCollider vs visual height (tol ±' + tol.toFixed(3) + 'm):');
for (const [x, z] of samples) {
	const expected = terrain.heightAt(x, z);
	const ray = new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });
	const hit = phys.world.castRay(ray, 100, true);
	if (!hit) {
		console.error(`  ✗ (${x}, ${z}) — ray missed the collider entirely`);
		assertFails++;
		continue;
	}
	const hitY = 50 + -1 * hit.timeOfImpact;
	const err = Math.abs(hitY - expected);
	worst = Math.max(worst, err);
	const ok = err <= tol;
	if (!ok) assertFails++;
	console.log(
		`  ${ok ? '✓' : '✗'} (${String(x).padStart(5)}, ${String(z).padStart(5)})  ` +
			`visual=${expected.toFixed(3)}  physics=${hitY.toFixed(3)}  Δ=${err.toFixed(3)}`,
	);
}
console.log(`\nWorst alignment error: ${worst.toFixed(4)}m (tol ${tol.toFixed(4)}m)`);

// ── 3. Character drops onto the surface ────────────────────────────────────
const spawnX = 8,
	spawnZ = -7;
const ch = phys.createCharacter({
	position: { x: spawnX, y: terrain.heightAt(spawnX, spawnZ) + 3, z: spawnZ },
	radius: 0.3,
	halfHeight: 0.55,
});
let grounded = false;
let feetY = 0;
for (let i = 0; i < 120; i++) {
	const res = ch.move({ x: 0, y: -0.3, z: 0 }); // gravity-ish pull each frame
	phys.step(1 / 60);
	feetY = res.position.y;
	if (res.grounded) {
		grounded = true;
		break;
	}
}
console.log('\nCharacter drop test:');
const expectedFeet = terrain.heightAt(spawnX, spawnZ);
check(grounded, 'character became grounded after falling');
check(
	Math.abs(feetY - expectedFeet) < 0.2,
	`feet settled on terrain: feet=${feetY.toFixed(3)} terrain=${expectedFeet.toFixed(3)}`,
);

phys.dispose();

console.log(
	`\n${assertFails === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${assertFails} CHECK(S) FAILED`}`,
);
process.exit(assertFails === 0 ? 0 : 1);
