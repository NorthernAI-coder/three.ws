// Temporary verification for Task 08 — pumpfun-graduations-sync.
// Opens the live PumpPortal migration feed exactly like the cron does, confirms
// it persists fresh rows to pumpfun_graduations, then confirms
// pumpfunMcp.graduations() serves that live data with no bot configured.
//
// Run: node scripts/verify-grad-sync.mjs   (DATABASE_URL must be exported)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const WINDOW_MS = Number(process.env.WINDOW_MS || 110_000);

const count = async () => (await sql`select count(*)::int as n from pumpfun_graduations`)[0].n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { connectPumpFunFeed } = await import('../api/_lib/pumpfun-ws-feed.js');

console.log(`[verify] opening live migration feed for ${WINDOW_MS / 1000}s …`);
const before = await count();
console.log('[verify] pumpfun_graduations rows before:', before);

const seen = new Map();
const controller = new AbortController();
const stop = connectPumpFunFeed({
	kind: 'graduation',
	signal: controller.signal,
	onEvent: ({ kind, data }) => {
		if (kind !== 'graduation') return;
		const sig = data?.tx_signature || data?.signature;
		if (sig && !seen.has(sig)) {
			seen.set(sig, true);
			console.log('[verify] graduation observed:', data.symbol || data.name || data.mint, sig.slice(0, 12));
		}
	},
});

await sleep(WINDOW_MS);
controller.abort();
try { stop?.(); } catch {}
await sleep(1000);

const after = await count();
console.log('[verify] observed this window:', seen.size);
console.log('[verify] pumpfun_graduations rows after:', after, `(delta +${after - before})`);

// Confirm the MCP client now serves live data with no bot configured.
delete process.env.PUMPFUN_BOT_URL;
const { pumpfunMcp, pumpfunBotEnabled } = await import('../api/_lib/pumpfun-mcp.js');
console.log('[verify] bot enabled?', pumpfunBotEnabled());
const grads = await pumpfunMcp.graduations({ limit: 3 });
console.log('[verify] pumpfunMcp.graduations() ok:', grads.ok, 'count:', grads.data?.length);
console.log('[verify] newest:', (grads.data || []).slice(0, 3).map((g) => g.symbol || g.name || g.mint));

process.exit(0);
