// Headless browser verification for cross-rig avatar rendering.
//
// Mounts the real <agent-3d> element (src/element.js → src/viewer.js, which
// configures the Draco/KTX2/Meshopt decoders → AnimationManager → the animation
// retargeter) against the committed Mixamo rig (michelle.glb) and the Avaturn
// reference rig (cz.glb), plays a clip, and asserts each: loads its model,
// renders the Hips bone UPRIGHT (the original "lying on its back" bug), and logs
// no console errors. A screenshot is captured per rig for visual confirmation.
//
// The page is served via request interception so everything stays on the dev
// origin (so `/src/element.js` and its graph resolve through Vite) without
// writing any scratch file into the repo.
//
// Requires a DEV server (npm run dev). Usage:
//   node scripts/verify-walk-rigs.mjs [baseUrl] [clip]   (default http://localhost:3000 walk)
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const CLIP = process.argv[3] || 'walk';
const RIGS = [
	{ name: 'michelle (Mixamo +90°X armature)', url: '/avatars/michelle.glb' },
	{ name: 'cz (Avaturn reference rig)', url: '/avatars/cz.glb' },
];

const pageHtml = (src) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#111}agent-3d{display:block;width:900px;height:700px}</style>
</head><body>
<agent-3d id="a" src="${src}" animation="${CLIP}" autoplay="1" controls="0"></agent-3d>
<script type="module">import '/src/element.js';</script>
</body></html>`;

// Runs in the browser: wait for the element's viewer to load its model, then
// report whether the Hips bone is upright (degrees off world vertical).
async function probe() {
	const el = document.getElementById('a');
	const deadline = Date.now() + 25000;
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	while (Date.now() < deadline) {
		const content = el?._viewer?.content;
		if (content) {
			// Let a few animation frames sample so we measure the playing pose.
			await sleep(1500);
			// GLTFLoader strips ':' from node names, so Mixamo's mixamorig:Hips
			// arrives as "mixamorigHips". Match any bone whose name ends in "hips"
			// and take the shortest (the root Hips, never a longer derived name).
			let hips = null;
			content.traverse((n) => {
				if (!n.isBone || !/hips$/i.test(n.name || '')) return;
				if (!hips || n.name.length < hips.name.length) hips = n;
			});
			if (!hips) return { loaded: true, hips: false };
			// Hips' local +Y axis in world space is column 1 of its world matrix
			// (no three import needed in this eval context). Its Y component is the
			// cosine of the tilt off world vertical: ~0° upright, ~90° lying down.
			hips.updateWorldMatrix(true, false);
			const e = hips.matrixWorld.elements;
			const len = Math.hypot(e[4], e[5], e[6]) || 1;
			const tilt = (Math.acos(Math.max(-1, Math.min(1, e[5] / len))) * 180) / Math.PI;
			return { loaded: true, hips: true, tiltDeg: tilt, hipsName: hips.name };
		}
		await sleep(400);
	}
	return { loaded: false };
}

const NOISE = /websocket|wss?:|vite|hmr|favicon|multiplayer|sourcemap|\bHMR\b|x402|analytics/i;

const browser = await chromium.launch();
let failures = 0;
for (const rig of RIGS) {
	const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
	const page = await ctx.newPage();
	const errors = [];
	page.on('console', (m) => m.type() === 'error' && !NOISE.test(m.text()) && errors.push(m.text()));
	page.on('pageerror', (e) => !NOISE.test(String(e)) && errors.push(String(e)));
	// Serve our clean-room page for this synthetic path; everything else (the
	// element module, three, the GLB, the clip JSON) passes through to Vite.
	const url = `${BASE}/__rigcheck`;
	await page.route(url, (route) =>
		route.fulfill({ contentType: 'text/html', body: pageHtml(rig.url) }),
	);
	process.stdout.write(`\n=== ${rig.name} — clip "${CLIP}" ===\n`);
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	const res = await page.evaluate(probe);
	await page.screenshot({ path: `/tmp/rigcheck-${rig.url.split('/').pop()}.png` });

	const upright = res.loaded && res.hips && res.tiltDeg < 30;
	const ok = upright && errors.length === 0;
	if (!res.loaded) process.stdout.write('model did NOT load within timeout\n');
	else if (!res.hips) process.stdout.write('loaded but no Hips bone found\n');
	else process.stdout.write(`Hips "${res.hipsName}" tilt = ${res.tiltDeg.toFixed(1)}° off vertical\n`);
	process.stdout.write(`console errors: ${errors.length}\n`);
	for (const e of errors.slice(0, 6)) process.stdout.write(`  • ${e}\n`);
	process.stdout.write(`screenshot: /tmp/rigcheck-${rig.url.split('/').pop()}.png\n${ok ? 'PASS' : 'FAIL'}\n`);
	if (!ok) failures++;
	await ctx.close();
}
await browser.close();
process.stdout.write(`\n${failures === 0 ? 'ALL RIGS OK' : failures + ' RIG(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
