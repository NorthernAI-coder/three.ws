import { describe, it, expect } from 'vitest';

import {
	detectArTarget,
	assertArAssetUrl,
	buildSceneViewerUrl,
	buildViewerUrl,
	buildArLaunchUrl,
	planArLaunch,
} from '../api/_lib/ar-launch.js';
import { toolDefs as arDefs } from '../api/_mcp3d/tools/ar.js';
import { validateSpatialArtifact } from '../api/_lib/spatial-mcp.js';

const GLB = 'https://three.ws/cdn/creations/model.glb';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

describe('detectArTarget', () => {
	it('classifies iOS, Android, and desktop', () => {
		expect(detectArTarget(IOS)).toBe('ios');
		expect(detectArTarget('… iPad …')).toBe('ios');
		expect(detectArTarget(ANDROID)).toBe('android');
		expect(detectArTarget(DESKTOP)).toBe('desktop');
		expect(detectArTarget('')).toBe('desktop');
	});
});

describe('assertArAssetUrl — boundary rejection', () => {
	it('accepts an https .glb / .gltf', () => {
		expect(assertArAssetUrl(GLB)).toBe(GLB);
		expect(assertArAssetUrl('https://x.io/a.gltf')).toBe('https://x.io/a.gltf');
		expect(assertArAssetUrl('https://x.io/a.glb?token=1')).toContain('.glb');
	});
	it('rejects non-https, non-glb, and garbage — with a coded error, not a crash', () => {
		expect(() => assertArAssetUrl('http://x.io/a.glb')).toThrow(/https/i);
		expect(() => assertArAssetUrl('https://x.io/a.png')).toThrow(/\.glb/i);
		expect(() => assertArAssetUrl('not a url')).toThrow(/valid https url/i);
		try {
			assertArAssetUrl('http://x.io/a.glb');
		} catch (e) {
			expect(e.code).toBe('not_https');
			expect(e.arUserMessage).toBe(true);
		}
	});
});

describe('buildSceneViewerUrl', () => {
	it('builds an ARCore intent URL with the GLB as the source and a browser fallback', () => {
		const u = buildSceneViewerUrl(GLB, { title: 'Robot', fallbackUrl: 'https://three.ws/viewer?src=x' });
		expect(u).toMatch(/^intent:\/\/arvr\.google\.com\/scene-viewer\/1\.2\?/);
		expect(u).toContain('package=com.google.ar.core');
		expect(u).toContain(encodeURIComponent(GLB));
		expect(u).toContain('S.browser_fallback_url=');
	});
});

describe('planArLaunch — device routing', () => {
	it('Android → redirect to Scene Viewer', () => {
		const p = planArLaunch({ glbUrl: GLB, userAgent: ANDROID, origin: 'https://three.ws' });
		expect(p.target).toBe('android');
		expect(p.action).toBe('redirect');
		expect(p.url).toContain('scene-viewer');
	});
	it('iOS → serve the launch page', () => {
		const p = planArLaunch({ glbUrl: GLB, userAgent: IOS, origin: 'https://three.ws' });
		expect(p.target).toBe('ios');
		expect(p.action).toBe('page');
		expect(p.viewerUrl).toContain('/viewer?src=');
	});
	it('desktop → serve the launch page (WebGL fallback)', () => {
		const p = planArLaunch({ glbUrl: GLB, userAgent: DESKTOP, origin: 'https://three.ws' });
		expect(p.target).toBe('desktop');
		expect(p.action).toBe('page');
	});
	it('bad input throws at the boundary (handled by the endpoint)', () => {
		expect(() => planArLaunch({ glbUrl: 'http://x/a.glb', userAgent: IOS, origin: 'https://three.ws' })).toThrow();
	});
});

describe('buildViewerUrl / buildArLaunchUrl', () => {
	it('build https viewer and AR launch URLs', () => {
		expect(buildViewerUrl('https://three.ws', GLB)).toBe(`https://three.ws/viewer?src=${encodeURIComponent(GLB)}`);
		expect(buildArLaunchUrl('https://three.ws', GLB)).toBe(`https://three.ws/api/ar?src=${encodeURIComponent(GLB)}`);
	});
});

describe('export_ar MCP tool', () => {
	const tool = arDefs.find((d) => d.name === 'export_ar');
	const req = { headers: { host: 'three.ws', 'x-forwarded-proto': 'https' } };

	it('is a free, read-only tool', () => {
		expect(tool).toBeTruthy();
		expect(tool.scope).toBeUndefined();
		expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	});

	it('returns AR links and a conformant spatial artifact with the AR handoff', async () => {
		const r = await tool.handler({ glb_url: GLB, title: 'Robot' }, null, req);
		const sc = r.structuredContent;
		expect(sc.arLaunchUrl).toContain('/api/ar?src=');
		expect(sc.viewerUrl).toContain('/viewer?src=');
		expect(sc.sceneViewerUrl).toContain('scene-viewer');
		// The embedded spatial artifact is conformant and carries the AR block.
		const v = validateSpatialArtifact(sc.spatial);
		expect(v.valid).toBe(true);
		expect(sc.spatial.ar.supported).toBe(true);
		expect(sc.spatial.ar.launchUrl).toContain('/api/ar');
	});

	it('rejects bad input cleanly (isError, no crash)', async () => {
		const r = await tool.handler({ glb_url: 'http://x/a.glb' }, null, req);
		expect(r.isError).toBe(true);
		expect(r.structuredContent.error).toBe(true);
	});

	it('response carries no payment/coin/internal-id surface (OpenAI-clean)', async () => {
		const r = await tool.handler({ glb_url: GLB }, null, req);
		const FORBIDDEN = /x402|payment|wallet|usdc|\$three|\btoken\b|\bcoin\b|price|\bpaid\b|onchain|web3|mint|session|trace|job_id|creation_id/i;
		expect(FORBIDDEN.test(JSON.stringify(r))).toBe(false);
	});
});
