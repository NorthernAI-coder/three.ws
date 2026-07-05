import { chromium } from 'playwright';

const AVATARS = [
	'cz.glb', 'michelle.glb', 'default.glb', 'realistic-female.glb',
	'realistic-male.glb', 'xbot.glb', 'studio.glb', 'selfie-girl.glb',
	'cesium-man.glb', 'dancing-twerk.glb',
];
const CLIP = 'https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/animations/library/clips/mx-covered-eyes-idle-c9c6b5f8b96c.json';

const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:3000/pose', { waitUntil: 'domcontentloaded' });
// Pull a real curated clip json to retarget (covereyes) from the site.
const clipJson = await page.evaluate(async () => {
	const r = await fetch('/animations/clips/covereyes.json');
	return r.json();
});

for (const a of AVATARS) {
	const out = await page.evaluate(async ({ url, clipJson }) => {
		try {
			const THREE = await import('/node_modules/.vite/deps/three.js');
		} catch {}
		const [{ GLTFLoader }, retarget, { getMeshoptDecoder }] = await Promise.all([
			import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js').catch(() =>
				import('three/addons/loaders/GLTFLoader.js')),
			import('/src/animation-retarget.js'),
			import('/src/viewer/internal.js'),
		]);
		const loader = new GLTFLoader();
		loader.setMeshoptDecoder(await getMeshoptDecoder());
		let gltf;
		try { gltf = await loader.loadAsync(url); } catch (e) { return { err: 'load:' + e.message }; }
		const scene = gltf.scene;
		scene.updateMatrixWorld(true);
		const map = retarget.canonicalNodeMapFromObject(scene);
		const clip = retarget.parseClipJSON(clipJson, 'covereyes');
		const { clip: bound, coverage } = retarget.retargetClipToObject(clip, scene, { minCoverage: 0 });
		return { bones: map.size, coverage: Math.round((coverage || 0) * 100), ok: !!bound };
	}, { url: `/avatars/${a}`, clipJson });
	console.log(a.padEnd(24), JSON.stringify(out));
}
await browser.close();
