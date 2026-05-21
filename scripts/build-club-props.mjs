#!/usr/bin/env node
/**
 * Authors the static props used by /club — pole.glb and stage.glb — and writes
 * them to public/club/props/. Composed at build time from Three.js primitives,
 * not at runtime, so the browser ships a real .glb file with named empties for
 * the spotlight + LED strip attach points (consumed by src/club.js).
 *
 * Run via: npm run build:club-props
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Blob } from 'node:buffer';

// Three's GLTFExporter touches DOM globals; mirror the shim from build-animations.mjs.
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({}) };
globalThis.Blob = Blob;

class NodeFileReader extends EventTarget {
	readAsDataURL(blob) {
		blob.arrayBuffer().then((buf) => {
			const b64 = Buffer.from(buf).toString('base64');
			this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
			this.onload?.({ target: this });
			this.dispatchEvent(new Event('load'));
		});
	}
	readAsArrayBuffer(blob) {
		blob.arrayBuffer().then((buf) => {
			this.result = buf;
			this.onload?.({ target: this });
			this.dispatchEvent(new Event('load'));
		});
	}
}
globalThis.FileReader = NodeFileReader;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/club/props');

const {
	Scene,
	Group,
	Mesh,
	Object3D,
	CylinderGeometry,
	BoxGeometry,
	TorusGeometry,
	MeshStandardMaterial,
} = await import('three');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

const POLE_HEIGHT = 3.6;
const POLE_RADIUS = 0.035;
const STAGE_RADIUS = 1.1;
const STAGE_HEIGHT = 0.18;

function chromeMat(name = 'PoleChrome') {
	const m = new MeshStandardMaterial({
		color: 0xe6e8f0,
		roughness: 0.14,
		metalness: 1.0,
	});
	m.name = name;
	return m;
}

function brushedMat(name = 'PoleBaseBrushed') {
	const m = new MeshStandardMaterial({
		color: 0xc8ccd8,
		roughness: 0.32,
		metalness: 0.95,
	});
	m.name = name;
	return m;
}

function darkMetalMat(name = 'BoltDark') {
	const m = new MeshStandardMaterial({
		color: 0x1a1c20,
		roughness: 0.45,
		metalness: 0.9,
	});
	m.name = name;
	return m;
}

function stageTopMat(name = 'StageTop') {
	const m = new MeshStandardMaterial({
		color: 0x18091a,
		roughness: 0.35,
		metalness: 0.7,
	});
	m.name = name;
	return m;
}

function stageSideMat(name = 'StageSide') {
	const m = new MeshStandardMaterial({
		color: 0x0a050d,
		roughness: 0.55,
		metalness: 0.55,
	});
	m.name = name;
	return m;
}

function ledMat(name = 'StageLED') {
	const m = new MeshStandardMaterial({
		color: 0xffffff,
		emissive: 0xff4dd6,
		emissiveIntensity: 1.0,
		roughness: 0.4,
		metalness: 0.1,
	});
	m.name = name;
	return m;
}

/**
 * Build pole.glb scene. Origin = (0, 0, 0) at pole base footprint center; the
 * shaft extends upward to y = POLE_HEIGHT. Includes a flared base, ceiling
 * mount plate with four bolts, a spotlight bracket, and a named empty
 * `pole.light.attach` at the bracket tip.
 */
function buildPoleScene() {
	const scene = new Scene();
	scene.name = 'PoleScene';

	const root = new Group();
	root.name = 'PoleRoot';
	scene.add(root);

	// Flared base — wide bottom disc tapered to a narrow collar.
	const baseDisc = new Mesh(
		new CylinderGeometry(0.42, 0.46, 0.04, 40),
		brushedMat('PoleBase'),
	);
	baseDisc.name = 'pole.base';
	baseDisc.position.y = 0.02;
	root.add(baseDisc);

	const baseCollar = new Mesh(
		new CylinderGeometry(POLE_RADIUS * 2.1, 0.13, 0.09, 32),
		brushedMat('PoleCollar'),
	);
	baseCollar.name = 'pole.collar';
	baseCollar.position.y = 0.04 + 0.045;
	root.add(baseCollar);

	// Main shaft.
	const shaft = new Mesh(
		new CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 24, 1),
		chromeMat('PoleShaft'),
	);
	shaft.name = 'pole.shaft';
	shaft.position.y = POLE_HEIGHT / 2;
	root.add(shaft);

	// Ceiling mount plate at the top.
	const mountPlate = new Mesh(
		new BoxGeometry(0.26, 0.014, 0.26),
		brushedMat('PoleMountPlate'),
	);
	mountPlate.name = 'pole.mount.plate';
	mountPlate.position.y = POLE_HEIGHT + 0.007;
	root.add(mountPlate);

	// Four bolts at corners of the plate.
	const boltMat = darkMetalMat('PoleBolt');
	const boltGeom = new CylinderGeometry(0.012, 0.012, 0.022, 8);
	const boltInset = 0.10;
	const boltOffsets = [
		[+boltInset, +boltInset],
		[+boltInset, -boltInset],
		[-boltInset, +boltInset],
		[-boltInset, -boltInset],
	];
	for (let i = 0; i < boltOffsets.length; i++) {
		const [bx, bz] = boltOffsets[i];
		const bolt = new Mesh(boltGeom.clone(), boltMat);
		bolt.name = `pole.bolt.${i}`;
		bolt.position.set(bx, POLE_HEIGHT + 0.024, bz);
		root.add(bolt);
	}

	// Spotlight bracket — extends in +z from the mount plate.
	const bracketArm = new Mesh(
		new BoxGeometry(0.04, 0.02, 0.18),
		darkMetalMat('PoleBracketArm'),
	);
	bracketArm.name = 'pole.bracket.arm';
	bracketArm.position.set(0, POLE_HEIGHT + 0.024, 0.13);
	root.add(bracketArm);

	const bracketHead = new Mesh(
		new CylinderGeometry(0.025, 0.025, 0.04, 16),
		darkMetalMat('PoleBracketHead'),
	);
	bracketHead.name = 'pole.bracket.head';
	bracketHead.rotation.x = Math.PI / 2;
	bracketHead.position.set(0, POLE_HEIGHT + 0.024, 0.22);
	root.add(bracketHead);

	// Named empty for prompt-04 SpotLight anchoring.
	const attach = new Object3D();
	attach.name = 'pole.light.attach';
	attach.position.set(0, POLE_HEIGHT + 0.024, 0.24);
	root.add(attach);

	return scene;
}

/**
 * Build stage.glb scene. Origin = (0, 0, 0) at floor level under disc center;
 * the disc top is at y = STAGE_HEIGHT. Includes an LED strip ring around the
 * top edge with a named empty `stage.led.strip` at its center.
 */
function buildStageScene() {
	const scene = new Scene();
	scene.name = 'StageScene';

	const root = new Group();
	root.name = 'StageRoot';
	scene.add(root);

	// Main disc.
	const disc = new Mesh(
		new CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS + 0.04, STAGE_HEIGHT, 64, 1),
		stageSideMat('StageBody'),
	);
	disc.name = 'stage.body';
	disc.position.y = STAGE_HEIGHT / 2;
	root.add(disc);

	// Slightly raised non-slip top so the dancer's feet have a defined surface.
	const top = new Mesh(
		new CylinderGeometry(STAGE_RADIUS - 0.01, STAGE_RADIUS - 0.01, 0.004, 64, 1),
		stageTopMat('StageTopFace'),
	);
	top.name = 'stage.top';
	top.position.y = STAGE_HEIGHT + 0.002;
	root.add(top);

	// LED strip — thin torus around the upper edge.
	const led = new Mesh(
		new TorusGeometry(STAGE_RADIUS + 0.005, 0.012, 8, 96),
		ledMat('StageLEDStrip'),
	);
	led.name = 'stage.led.ring';
	led.rotation.x = Math.PI / 2;
	led.position.y = STAGE_HEIGHT - 0.014;
	root.add(led);

	// Named empty for prompt-04 LED pulse driver.
	const ledAttach = new Object3D();
	ledAttach.name = 'stage.led.strip';
	ledAttach.position.set(0, STAGE_HEIGHT - 0.014, 0);
	root.add(ledAttach);

	return scene;
}

async function exportGLB(scene) {
	const exporter = new GLTFExporter();
	return new Promise((resolve, reject) => {
		exporter.parse(
			scene,
			(buf) => resolve(buf),
			(err) => reject(err),
			{ binary: true, embedImages: true, onlyVisible: true },
		);
	});
}

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	const targets = [
		{ name: 'pole.glb', scene: buildPoleScene() },
		{ name: 'stage.glb', scene: buildStageScene() },
	];

	for (const { name, scene } of targets) {
		const buf = await exportGLB(scene);
		const bytes = Buffer.from(buf);
		const outPath = resolve(OUT_DIR, name);
		writeFileSync(outPath, bytes);
		console.log(`[club-props] wrote ${name.padEnd(10)} ${(bytes.length / 1024).toFixed(1)} kB`);
	}
}

main().catch((err) => {
	console.error('[club-props] build failed:', err);
	process.exit(1);
});
