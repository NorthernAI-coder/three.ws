#!/usr/bin/env node
// i18n-translate — incremental, glossary-locked machine translation of the
// source catalog into every target locale, modeled on LobeHub's lobe-i18n.
//
// Pipeline (matches the LobeHub approach, adapted for three.ws):
//   1. Read the entryLocale catalog (locales/en.json) as the source of truth.
//   2. For each target locale, diff against the committed translation and
//      translate ONLY the missing/empty keys — re-runs are nearly free.
//   3. Brand/protocol terms, {{placeholders}}, and HTML tags are masked to
//      opaque sentinels before the text reaches the model and restored after,
//      so `$THREE`, the contract address, etc. come back byte-for-byte.
//   4. Large namespaces are split under a token budget; chunks run concurrently.
//   5. Output is committed as static JSON — zero runtime translation cost.
//
// Backends (real APIs, selected by `provider` in .i18nrc.json):
//   gemini    → Generative Language API   (GEMINI_API_KEY | GOOGLE_API_KEY)
//   openai    → Chat Completions          (OPENAI_API_KEY [+ OPENAI_BASE_URL])
//   anthropic → Messages                  (ANTHROPIC_API_KEY)
//
// Usage:
//   node scripts/i18n-translate.mjs                 # translate missing keys, all locales
//   node scripts/i18n-translate.mjs --locale=es     # one locale
//   node scripts/i18n-translate.mjs --force         # retranslate everything
//   node scripts/i18n-translate.mjs --lint          # validate only (build gate, no API key needed)
//   node scripts/i18n-translate.mjs --dry-run       # report what would translate

import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	ROOT,
	loadConfig,
	readJSON,
	flatten,
	setDeep,
	getDeep,
	missingKeys,
	mergeOrdered,
	buildMasker,
	lintLocale,
} from './lib/i18n-shared.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : undefined;
};

const cfg = loadConfig();
const sourcePath = resolve(ROOT, cfg.entry);
const source = readJSON(sourcePath);
if (!source) {
	console.error(`Source catalog not found: ${cfg.entry}. Run \`npm run i18n:extract\` first.`);
	process.exit(1);
}

const onlyLocale = opt('locale');
const targets = (onlyLocale ? [onlyLocale] : cfg.outputLocales).filter(Boolean);
const localePath = (code) => resolve(ROOT, cfg.output, `${code}.json`);

// --- lint mode: pure validation, no network, safe to run in CI -------------

function runLint() {
	let problems = 0;
	for (const code of targets) {
		const target = readJSON(localePath(code));
		if (!target) {
			// Configured but not yet translated — not an integrity failure. Lint
			// gates the catalogs we actually ship; run `npm run i18n:translate` to
			// generate the rest.
			console.log(`◦ ${code}: not generated yet (skipped)`);
			continue;
		}
		const found = lintLocale(source, target, { code, doNotTranslate: cfg.doNotTranslate });
		if (found.length) {
			problems += found.length;
			for (const p of found) console.error('✗ ' + p);
		} else {
			console.log(`✓ ${code}: ${Object.keys(flatten(target)).length} keys OK`);
		}
	}
	if (problems) {
		console.error(`\ni18n lint failed: ${problems} problem(s).`);
		process.exit(1);
	}
	console.log('\ni18n lint passed.');
}

// --- chunking --------------------------------------------------------------

// Split missing keys into chunks whose combined source text stays under the
// token budget (≈4 chars/token) so no single request risks truncation.
function chunkKeys(keys, budgetChars) {
	const chunks = [];
	let cur = [];
	let size = 0;
	for (const k of keys) {
		const len = String(getDeep(source, k) ?? '').length + k.length + 8;
		if (cur.length && size + len > budgetChars) {
			chunks.push(cur);
			cur = [];
			size = 0;
		}
		cur.push(k);
		size += len;
	}
	if (cur.length) chunks.push(cur);
	return chunks;
}

// --- LLM backends ----------------------------------------------------------

function stripFences(text) {
	return text
		.replace(/^\s*```(?:json)?/i, '')
		.replace(/```\s*$/, '')
		.trim();
}

function buildPrompt(langName, payload) {
	return [
		`You are a professional software localizer translating UI and marketing copy from English to ${langName}.`,
		cfg.reference || '',
		'',
		'Rules:',
		`- Translate every VALUE in the JSON below into ${langName}. Keep every KEY exactly as-is.`,
		'- Return ONLY a single minified JSON object with the same keys. No prose, no code fences.',
		'- Some values contain sentinel runs of unusual non-Latin control characters (private-use-area glyphs surrounding digits). These are protected tokens for brand names, code, and placeholders. Reproduce every such sentinel EXACTLY, in a natural position for the target language. Never translate, reorder the digits, drop, or add them.',
		'- Preserve meaning, tone, and any HTML that survives as a sentinel. Do not add explanations.',
		'',
		'JSON to translate:',
		JSON.stringify(payload),
	]
		.filter(Boolean)
		.join('\n');
}

async function callGemini(prompt) {
	const key =
		process.env.GEMINI_API_KEY ||
		process.env.GOOGLE_API_KEY ||
		process.env.GOOGLE_GENAI_API_KEY;
	if (!key) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
	const model = cfg.modelName || 'gemini-2.5-flash';
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: {
				temperature: cfg.temperature ?? 0.2,
				topP: cfg.topP ?? 0.9,
				responseMimeType: 'application/json',
			},
		}),
	});
	if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const data = await res.json();
	const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
	if (!text) throw new Error('gemini returned empty content');
	return text;
}

async function callOpenAI(prompt) {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error('OPENAI_API_KEY not set');
	const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
	const res = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: cfg.modelName || 'gpt-4o-mini',
			temperature: cfg.temperature ?? 0.2,
			top_p: cfg.topP ?? 0.9,
			response_format: { type: 'json_object' },
			messages: [{ role: 'user', content: prompt }],
		}),
	});
	if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const data = await res.json();
	return data?.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt) {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) throw new Error('ANTHROPIC_API_KEY not set');
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': key,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: cfg.modelName || 'claude-haiku-4-5-20251001',
			max_tokens: 8192,
			temperature: cfg.temperature ?? 0.2,
			messages: [{ role: 'user', content: prompt }],
		}),
	});
	if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const data = await res.json();
	return data?.content?.map((b) => b.text || '').join('') || '';
}

const BACKENDS = { gemini: callGemini, openai: callOpenAI, anthropic: callAnthropic };

async function translateChunk(langName, payload, attempt = 0) {
	const call = BACKENDS[cfg.provider || 'gemini'];
	if (!call) throw new Error(`unknown provider: ${cfg.provider}`);
	try {
		const raw = await call(buildPrompt(langName, payload));
		const parsed = JSON.parse(stripFences(raw));
		if (!parsed || typeof parsed !== 'object') throw new Error('non-object response');
		return parsed;
	} catch (err) {
		if (attempt < 2) {
			await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
			return translateChunk(langName, payload, attempt + 1);
		}
		throw err;
	}
}

// Bounded-concurrency map.
async function pool(items, limit, worker) {
	const results = new Array(items.length);
	let i = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (i < items.length) {
			const idx = i++;
			results[idx] = await worker(items[idx], idx);
		}
	});
	await Promise.all(runners);
	return results;
}

// --- per-locale translation ------------------------------------------------

const masker = buildMasker(cfg.doNotTranslate);

async function translateLocale(code) {
	const langName = cfg.localeNames?.[code] || code;
	const existing = readJSON(localePath(code), {}) || {};
	const todo = flag('force') ? Object.keys(flatten(source)) : missingKeys(source, existing);

	if (!todo.length) {
		console.log(`• ${code}: up to date`);
		return { code, translated: 0 };
	}
	if (flag('dry-run')) {
		console.log(`• ${code}: would translate ${todo.length} key(s)`);
		return { code, translated: 0 };
	}

	const chunks = chunkKeys(todo, (cfg.splitToken || 1200) * 4);
	console.log(
		`→ ${code}: ${todo.length} key(s) in ${chunks.length} chunk(s) via ${cfg.provider}`,
	);

	const translatedFlat = {};
	let done = 0;

	await pool(chunks, cfg.concurrency || 4, async (keys) => {
		// Mask source values; remember tokens per key to restore afterwards.
		const payload = {};
		const tokenMap = {};
		for (const k of keys) {
			const { masked, tokens } = masker.mask(String(getDeep(source, k) ?? ''));
			payload[k] = masked;
			tokenMap[k] = tokens;
		}
		const out = await translateChunk(langName, payload, 0);
		for (const k of keys) {
			const val = out[k];
			if (typeof val !== 'string') {
				console.warn(`  ! ${code} ${k}: model omitted key, keeping source`);
				translatedFlat[k] = getDeep(source, k);
				continue;
			}
			translatedFlat[k] = masker.unmask(val, tokenMap[k]);
		}
		done += keys.length;
		if (cfg.saveImmediately) {
			persist(code, existing, translatedFlat);
		}
		console.log(`  ${code}: ${done}/${todo.length}`);
	});

	persist(code, existing, translatedFlat);
	return { code, translated: todo.length };
}

// Merge fresh translations over prior ones, dropping stale keys (mergeOrdered
// only emits keys that exist in the source), and write committed JSON.
function persist(code, existing, translatedFlat) {
	const translatedNested = {};
	for (const [k, v] of Object.entries(translatedFlat)) setDeep(translatedNested, k, v);
	const merged = mergeOrdered(source, existing, translatedNested);
	writeFileSync(localePath(code), JSON.stringify(merged, null, '\t') + '\n');
}

// Refresh the runtime manifest the locale switcher reads. Only locales with a
// committed catalog are listed, so the switcher never offers a language that
// would silently fall back to English.
function writeManifest() {
	const ready = (code) => code === cfg.entryLocale || existsSync(localePath(code));
	const localesList = [cfg.entryLocale, ...cfg.outputLocales].filter(ready).map((code) => ({
		code,
		name: cfg.localeNames?.[code] || code,
		dir: (cfg.rtlLocales || []).includes(code) ? 'rtl' : 'ltr',
	}));
	const manifest = { default: cfg.entryLocale, locales: localesList };
	writeFileSync(
		resolve(ROOT, cfg.output, 'manifest.json'),
		JSON.stringify(manifest, null, '\t') + '\n',
	);
}

async function main() {
	if (flag('lint')) return runLint();

	writeManifest();
	const results = await pool(targets, 1, translateLocale); // locales sequential; chunks parallel within
	const n = results.reduce((s, r) => s + (r?.translated || 0), 0);
	console.log(`\ni18n-translate: ${n} key(s) translated across ${targets.length} locale(s).`);
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
