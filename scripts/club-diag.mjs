import { chromium } from 'playwright';

const URL = process.env.CLUB_URL || 'http://localhost:3001/club';
const SETTLE = Number(process.env.SETTLE || 12000);

const browser = await chromium.launch({
	args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
	const future = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
	localStorage.setItem('club:pass:v1', JSON.stringify({ passId: 'dev', tier: 'regular', visits: 1, expiresAt: future, wallet: 'devwallet', issuedAt: new Date().toISOString() }));
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(SETTLE);

const diag = await page.evaluate(() => {
	const THREE = window.__THREE || null;
	const stations = window.__clubStations || [];
	function applyMat(m, x, y, z) {
		const e = m.elements;
		return {
			x: e[0] * x + e[4] * y + e[8] * z + e[12],
			y: e[1] * x + e[5] * y + e[9] * z + e[13],
			z: e[2] * x + e[6] * y + e[10] * z + e[14],
		};
	}
	function boxOf(obj) {
		try {
			obj.updateMatrixWorld(true);
			const min = { x: Infinity, y: Infinity, z: Infinity };
			const max = { x: -Infinity, y: -Infinity, z: -Infinity };
			let skinned = 0, meshes = 0;
			obj.traverse((n) => {
				if (n.isSkinnedMesh) skinned++;
				if (n.isMesh) meshes++;
				if (n.isMesh && n.geometry) {
					let bb;
					if (n.isSkinnedMesh && typeof n.computeBoundingBox === 'function') {
						n.skeleton?.update?.();
						n.computeBoundingBox();
						bb = n.boundingBox;
					} else {
						n.geometry.computeBoundingBox?.();
						bb = n.geometry.boundingBox;
					}
					if (!bb) return;
					for (const xi of [bb.min.x, bb.max.x]) for (const yi of [bb.min.y, bb.max.y]) for (const zi of [bb.min.z, bb.max.z]) {
						const w = applyMat(n.matrixWorld, xi, yi, zi);
						min.x = Math.min(min.x, w.x); min.y = Math.min(min.y, w.y); min.z = Math.min(min.z, w.z);
						max.x = Math.max(max.x, w.x); max.y = Math.max(max.y, w.y); max.z = Math.max(max.z, w.z);
					}
				}
			});
			const r = (v) => +v.toFixed(2);
			return {
				meshes, skinned,
				worldMin: { x: r(min.x), y: r(min.y), z: r(min.z) },
				worldMax: { x: r(max.x), y: r(max.y), z: r(max.z) },
				worldH: r(max.y - min.y), worldW: r(max.x - min.x),
			};
		} catch (e) { return { err: String(e) }; }
	}
	return stations.map((s) => {
		const rig = s.rig;
		const child = rig && rig.children && rig.children[0];
		const info = {
			idx: s.idx, id: s.id,
			walkPhase: s.walkPhase,
			rigPos: rig ? { x: +rig.position.x.toFixed(2), y: +rig.position.y.toFixed(2), z: +rig.position.z.toFixed(2) } : null,
			rigChildren: rig ? rig.children.length : -1,
			skinnedSet: !!s.skinned,
			child: child ? boxOf(child) : null,
			childScale: child ? { x: +child.scale.x.toFixed(3), y: +child.scale.y.toFixed(3), z: +child.scale.z.toFixed(3) } : null,
			childPosY: child ? +child.position.y.toFixed(3) : null,
			childVisible: child ? child.visible : null,
			hasAnim: !!s.anim,
			currentName: s.anim?.currentName ?? null,
			actions: s.anim ? [...s.anim.actions.keys()] : null,
			supportsCanonical: s.anim?.supportsCanonicalClips?.() ?? null,
		};
		// Force bind pose: stop the mixer, reset the skeleton to bind, re-measure.
		try {
			s.anim?.mixer?.stopAllAction();
			if (child) {
				child.traverse((n) => { if (n.isSkinnedMesh) { n.skeleton.pose(); n.skeleton.update(); } });
				info.bindBox = boxOf(child);
			}
		} catch (e) { info.bindErr = String(e); }
		return info;
	});
});
console.log(JSON.stringify(diag, null, 2));
console.log('--- relevant logs ---');
console.log(logs.filter((l) => /club|retarget|avatar|fallen|error|warn/i.test(l)).slice(0, 30).join('\n'));
await browser.close();
