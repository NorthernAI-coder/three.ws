// Render the "standing outside the club" mix to a downloadable file.
//
// Reproduces, offline, exactly what the /club entrance plays at clarity 0 —
// the music bed + room ambience run through the outdoor effects chain from
// src/club-audio.js (ensureContext / setClarity at f=0):
//
//   music (club.mp3 × 0.85) + ambience (loop × 0.35)
//     → lowshelf  +10 dB @ 90 Hz                  (_fx.bass)
//     → lowpass   420 Hz, Q 1.0                    (_fx.lowpass)
//     → split: dry × 0.22  +  convolution × 0.85   (_fx.dry / _fx.outdoorWet)
//     → master × 0.75                              (MASTER_GAIN)
//     → brick-wall limiter (-1.5 dBFS, 20:1)       (this.limiter)
//
// The convolution reverb uses the same synthetic impulse response the browser
// builds at runtime — _buildIR(duration=5.0, decay=1.0, density=0.32): sparse
// noise with a (1 - i/len)^decay envelope, each channel normalised to unit
// energy. We seed the noise deterministically so re-runs are byte-stable.
//
// Usage: node scripts/render-club-outside.mjs [outBasePath]
// Requires ffmpeg (same dependency as scripts/build-club-audio.mjs).

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AUDIO = join(ROOT, 'public', 'club', 'audio');

// ── Outdoor effects-chain constants (mirrored from src/club-audio.js) ──────────
const MUSIC_GAIN = 0.85;
const AMBIENCE_GAIN = 0.35;
const MASTER_GAIN = 0.75;
const OUT = { freq: 420, q: 1.0, bass: 10, dry: 0.22, outWet: 0.85 };
const IR = { duration: 5.0, decay: 1.0, density: 0.32 };
const RATE = 44100;

// Deterministic PRNG (mulberry32) so the IR — and thus the render — is stable.
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// _buildIR(duration, decay, density) → stereo float32 WAV, channels unit-energy.
function buildImpulseWav() {
	const len = Math.floor(RATE * IR.duration);
	const chans = [new Float32Array(len), new Float32Array(len)];
	for (let c = 0; c < 2; c++) {
		const rnd = mulberry32(0x3eeb + c); // distinct stream per channel
		const ch = chans[c];
		let sumSq = 0;
		for (let i = 0; i < len; i++) {
			const r =
				IR.density >= 1
					? rnd() * 2 - 1
					: rnd() < IR.density
						? rnd() * 2 - 1
						: 0;
			const v = r * Math.pow(1 - i / len, IR.decay);
			ch[i] = v;
			sumSq += v * v;
		}
		const norm = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 1;
		for (let i = 0; i < len; i++) ch[i] *= norm;
	}
	return encodeWavFloat32(chans, RATE);
}

function encodeWavFloat32(channels, rate) {
	const n = channels[0].length;
	const numCh = channels.length;
	const bytesPerSample = 4;
	const blockAlign = numCh * bytesPerSample;
	const dataLen = n * blockAlign;
	const buf = Buffer.alloc(44 + dataLen);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + dataLen, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(3, 20); // IEEE float
	buf.writeUInt16LE(numCh, 22);
	buf.writeUInt32LE(rate, 24);
	buf.writeUInt32LE(rate * blockAlign, 28);
	buf.writeUInt16LE(blockAlign, 32);
	buf.writeUInt16LE(bytesPerSample * 8, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(dataLen, 40);
	let off = 44;
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < numCh; c++) {
			buf.writeFloatLE(channels[c][i], off);
			off += 4;
		}
	}
	return buf;
}

const outBase = process.argv[2] || join(ROOT, 'club-outside');
const tmp = mkdtempSync(join(tmpdir(), 'club-outside-'));
const irPath = join(tmp, 'outdoor-ir.wav');

try {
	writeFileSync(irPath, buildImpulseWav());
	console.log(`Built outdoor IR: ${IR.duration}s, density ${IR.density} → ${irPath}`);

	// acompressor threshold is linear amplitude: -1.5 dBFS = 10^(-1.5/20).
	const limThresh = Math.pow(10, -1.5 / 20).toFixed(4);

	const filter = [
		`[0:a]volume=${MUSIC_GAIN},aformat=sample_rates=${RATE}:channel_layouts=stereo[music]`,
		`[1:a]volume=${AMBIENCE_GAIN},aformat=sample_rates=${RATE}:channel_layouts=stereo[amb]`,
		`[music][amb]amix=inputs=2:duration=first:normalize=0[mix]`,
		// lowshelf bass + lowpass muffle
		`[mix]bass=g=${OUT.bass}:f=90[bassed]`,
		`[bassed]lowpass=f=${OUT.freq}:width_type=q:width=${OUT.q}[lp]`,
		`[lp]asplit=2[lpd][lpw]`,
		`[lpd]volume=${OUT.dry}[dry]`,
		// through-the-door convolution reverb
		`[lpw][2:a]afir=gtype=none:dry=0:wet=1[rev]`,
		`[rev]volume=${OUT.outWet}[wet]`,
		`[dry][wet]amix=inputs=2:duration=first:normalize=0[summed]`,
		`[summed]volume=${MASTER_GAIN}[mastered]`,
		`[mastered]acompressor=threshold=${limThresh}:ratio=20:attack=3:release=250:knee=1:detection=peak[out]`,
	].join(';');

	const common = [
		'-hide_banner', '-y',
		'-i', join(AUDIO, 'club.mp3'),
		'-stream_loop', '-1', '-i', join(AUDIO, 'ambience.mp3'),
		'-i', irPath,
		'-filter_complex', filter,
		'-map', '[out]',
	];

	const renders = [
		{ ext: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '2'] },
		{ ext: 'ogg', args: ['-c:a', 'libvorbis', '-q:a', '5'] },
	];

	for (const r of renders) {
		const out = `${outBase}.${r.ext}`;
		console.log(`Rendering ${out} …`);
		const res = spawnSync('ffmpeg', [...common, ...r.args, out], { stdio: ['ignore', 'ignore', 'inherit'] });
		if (res.status !== 0) {
			throw new Error(`ffmpeg failed for ${r.ext} (exit ${res.status})`);
		}
		console.log(`  ✓ ${out}`);
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
