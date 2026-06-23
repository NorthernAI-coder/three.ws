/**
 * MicCapture — cross-browser microphone capture for the NVIDIA Riva ASR lane.
 *
 * The browser's MediaRecorder produces WebM/Opus, which Riva ASR rejects, so we
 * capture raw PCM via the Web Audio graph instead and resample it to the 16 kHz
 * mono LINEAR_PCM that /api/asr expects. This works in every browser — including
 * Firefox, where window.SpeechRecognition does not exist — which is the whole
 * reason the Riva lane exists.
 *
 * Capture path:
 *   getUserMedia ─▶ MediaStreamSource ─▶ AudioWorklet (or ScriptProcessor) ─▶ Float32 chunks
 *                                    └─▶ AnalyserNode (live RMS for the UI mic meter)
 *
 * The AudioContext runs at the device's native rate; we accumulate Float32
 * samples and downsample to 16 kHz only when a WAV is built (final on release,
 * or an interim snapshot mid-hold), so no per-sample resampling runs on the
 * audio thread. AudioWorklet is preferred; ScriptProcessorNode is the fallback
 * for Safari/older browsers where addModule isn't available.
 *
 * Usage:
 *   const mic = new MicCapture();
 *   await mic.start();                 // throws 'permission-denied' | 'no-mic' | 'unsupported'
 *   mic.getLevel();                    // 0..1 RMS, drive a live indicator
 *   const interim = mic.snapshotWav(); // Blob | null — audio so far, for a partial pass
 *   const final = await mic.stop();    // Blob | null — the full utterance as a 16 kHz WAV
 *   mic.dispose();                     // idempotent teardown
 */

const TARGET_RATE = 16000;

// Posts mono Float32 frames from the audio thread to the main thread. Kept tiny
// and dependency-free so it survives being inlined as a Blob module URL.
const WORKLET_SRC = /* js */ `
class MicCaptureProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const ch = inputs[0] && inputs[0][0];
		if (ch && ch.length) this.port.postMessage(ch.slice(0));
		return true;
	}
}
registerProcessor('mic-capture', MicCaptureProcessor);
`;

export class MicCapture {
	constructor() {
		this._stream = null;
		this._ctx = null;
		this._source = null;
		this._node = null; // AudioWorkletNode | ScriptProcessorNode
		this._analyser = null;
		this._chunks = [];
		this._length = 0;
		this._sourceRate = TARGET_RATE;
		this._levelBuf = null;
		this._started = false;
		this._disposed = false;
	}

	get capturing() {
		return this._started;
	}

	/** Whether the environment can capture at all (no mic UI on insecure origins). */
	static isSupported() {
		return (
			typeof navigator !== 'undefined' &&
			!!navigator.mediaDevices?.getUserMedia &&
			!!(window.AudioContext || window.webkitAudioContext)
		);
	}

	/**
	 * Acquire the mic and begin buffering. Rejects with an Error whose `.code` is
	 * one of: 'unsupported' | 'permission-denied' | 'no-mic' | 'capture-failed'
	 * so the caller can message each case precisely.
	 */
	async start() {
		if (this._started) return;
		if (!MicCapture.isSupported()) throw codedError('Microphone capture is not supported in this browser.', 'unsupported');

		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			});
		} catch (err) {
			const name = err?.name || '';
			if (name === 'NotAllowedError' || name === 'SecurityError') {
				throw codedError('Microphone access was blocked. Allow the mic, or type your message instead.', 'permission-denied');
			}
			if (name === 'NotFoundError' || name === 'OverconstrainedError') {
				throw codedError('No microphone was found. Plug one in, or type your message instead.', 'no-mic');
			}
			throw codedError(`Could not start the microphone: ${err?.message || name || 'unknown error'}`, 'capture-failed');
		}
		this._stream = stream;

		const AC = window.AudioContext || window.webkitAudioContext;
		const ctx = new AC();
		this._ctx = ctx;
		this._sourceRate = ctx.sampleRate || TARGET_RATE;
		if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

		this._source = ctx.createMediaStreamSource(stream);

		this._analyser = ctx.createAnalyser();
		this._analyser.fftSize = 512;
		this._levelBuf = new Uint8Array(this._analyser.fftSize);
		this._source.connect(this._analyser);

		const onFrame = (frame) => {
			if (!this._started) return;
			// Copy — the worklet transfers a view backed by a reused buffer.
			const copy = frame instanceof Float32Array ? frame : new Float32Array(frame);
			this._chunks.push(copy.slice ? copy.slice(0) : new Float32Array(copy));
			this._length += copy.length;
		};

		let usedWorklet = false;
		if (ctx.audioWorklet?.addModule) {
			try {
				const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
				await ctx.audioWorklet.addModule(url);
				URL.revokeObjectURL(url);
				const node = new AudioWorkletNode(ctx, 'mic-capture');
				node.port.onmessage = (e) => onFrame(e.data);
				this._source.connect(node);
				// A muted sink keeps the worklet pulling frames without echoing the mic.
				const sink = ctx.createGain();
				sink.gain.value = 0;
				node.connect(sink).connect(ctx.destination);
				this._node = node;
				usedWorklet = true;
			} catch {
				usedWorklet = false; // fall through to ScriptProcessor
			}
		}

		if (!usedWorklet) {
			const node = ctx.createScriptProcessor(4096, 1, 1);
			node.onaudioprocess = (e) => onFrame(e.inputBuffer.getChannelData(0));
			this._source.connect(node);
			node.connect(ctx.destination); // ScriptProcessor needs a destination to fire
			this._node = node;
		}

		this._started = true;
	}

	/** Live capture level, 0..1 RMS. Returns 0 before start / after stop. */
	getLevel() {
		if (!this._analyser || !this._levelBuf) return 0;
		this._analyser.getByteTimeDomainData(this._levelBuf);
		let sum = 0;
		for (let i = 0; i < this._levelBuf.length; i++) {
			const v = (this._levelBuf[i] - 128) / 128;
			sum += v * v;
		}
		return Math.min(1, Math.sqrt(sum / this._levelBuf.length) * 1.8);
	}

	/** Seconds of audio buffered so far. */
	get durationSec() {
		return this._length / this._sourceRate;
	}

	/**
	 * A WAV of everything captured so far WITHOUT stopping — used to fire an
	 * interim recognition pass mid-hold so partial words can surface. Returns null
	 * until there is enough audio (≈0.4 s) to be worth a round-trip.
	 */
	snapshotWav() {
		if (this._length < this._sourceRate * 0.4) return null;
		return this._buildWav();
	}

	/**
	 * Stop capture and return the full utterance as a 16 kHz mono WAV Blob, or
	 * null if nothing audible was captured. Releases the mic immediately; call
	 * dispose() to also close the audio context.
	 */
	async stop() {
		if (!this._started) return null;
		this._started = false;
		// Drop the live mic; the buffered samples are already ours.
		for (const track of this._stream?.getTracks() || []) {
			try {
				track.stop();
			} catch {}
		}
		const wav = this._length > 0 ? this._buildWav() : null;
		return wav;
	}

	/** Idempotent teardown of every audio resource. */
	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		this._started = false;
		try {
			if (this._node) {
				this._node.onaudioprocess = null;
				if (this._node.port) this._node.port.onmessage = null;
				this._node.disconnect();
			}
		} catch {}
		try {
			this._source?.disconnect();
		} catch {}
		try {
			this._analyser?.disconnect();
		} catch {}
		for (const track of this._stream?.getTracks() || []) {
			try {
				track.stop();
			} catch {}
		}
		if (this._ctx && this._ctx.state !== 'closed') {
			this._ctx.close().catch(() => {});
		}
		this._chunks = [];
		this._length = 0;
		this._node = null;
		this._source = null;
		this._analyser = null;
		this._stream = null;
		this._ctx = null;
	}

	// ── internal ──────────────────────────────────────────────────────────

	_flatten() {
		const out = new Float32Array(this._length);
		let offset = 0;
		for (const chunk of this._chunks) {
			out.set(chunk, offset);
			offset += chunk.length;
		}
		return out;
	}

	// Native-rate Float32 → 16 kHz mono → little-endian s16 → RIFF/WAVE Blob.
	_buildWav() {
		const native = this._flatten();
		const pcm16 = floatTo16kPcm(native, this._sourceRate);
		return new Blob([pcm16Wav(pcm16, TARGET_RATE)], { type: 'audio/wav' });
	}
}

function codedError(message, code) {
	const err = new Error(message);
	err.code = code;
	return err;
}

// Linear-interpolating resample of mono Float32 from `inRate` to 16 kHz, then
// quantize to little-endian s16. Linear interpolation is more than adequate for
// speech recognition and avoids pulling in a filter library.
function floatTo16kPcm(samples, inRate) {
	if (!samples.length) return new Int16Array(0);
	const ratio = inRate / TARGET_RATE;
	const outLen = ratio <= 1 ? samples.length : Math.floor(samples.length / ratio);
	const out = new Int16Array(outLen);
	for (let i = 0; i < outLen; i++) {
		const pos = i * ratio;
		const idx = Math.floor(pos);
		const frac = pos - idx;
		const a = samples[idx] || 0;
		const b = samples[idx + 1] !== undefined ? samples[idx + 1] : a;
		const s = a + (b - a) * frac;
		out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
	}
	return out;
}

// Wrap s16 PCM in a 44-byte RIFF/WAVE header. /api/asr strips this header back to
// raw LINEAR_PCM server-side (api/_lib/asr-nvidia.js parseWav).
function pcm16Wav(pcm16, sampleRate) {
	const channels = 1;
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataBytes = pcm16.length * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);
	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // PCM fmt chunk size
	view.setUint16(20, 1, true); // audio format: PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataBytes, true);
	let offset = 44;
	for (let i = 0; i < pcm16.length; i++, offset += 2) view.setInt16(offset, pcm16[i], true);
	return buffer;
}

function writeAscii(view, offset, str) {
	for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
