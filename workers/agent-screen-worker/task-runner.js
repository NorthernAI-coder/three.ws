/**
 * Default autonomous task: scan pump.fun for trending tokens, narrate findings.
 *
 * Swap this out (or extend it) for the agent's actual mission. The contract
 * is simple: receive { stagehand, page, cfg, push } and run a loop forever.
 * Call push() for every meaningful action so the screen stream stays live.
 *
 * Stagehand v3 API: page.act() and page.extract() (not stagehand.act/extract).
 */
import { z } from 'zod';

const PUMP_FUN_URL = 'https://pump.fun';

const TokenListSchema = z.object({
	tokens: z.array(
		z.object({
			name: z.string(),
			symbol: z.string().optional(),
			marketCap: z.string().optional(),
		})
	),
});

const TokenDetailSchema = z.object({
	price: z.string().optional(),
	holders: z.string().optional(),
	volume: z.string().optional(),
});

export async function runTask({ page, cfg, push }) {
	const { agentId, CYCLE_MS } = cfg;

	while (true) {
		try {
			// ── Navigate ────────────────────────────────────────────────────────
			await push({ agentId, page, activity: 'Navigating to pump.fun…', type: 'activity' });
			await page.goto(PUMP_FUN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
			await push({ agentId, page, activity: 'Scanning pump.fun for trending tokens', type: 'screenshot' });

			// ── Extract trending tokens ─────────────────────────────────────────
			let trending = { tokens: [] };
			try {
				trending = await page.extract({
					instruction: 'Extract the top 5 trending token names, symbols, and market caps visible on this page',
					schema: TokenListSchema,
				});
			} catch (err) {
				console.warn('[task] extract failed:', err.message);
			}

			const count = trending.tokens?.length ?? 0;
			await push({
				agentId,
				page,
				activity:
					count > 0
						? `Found ${count} trending token${count !== 1 ? 's' : ''}: ${trending.tokens
								.slice(0, 3)
								.map((t) => (t.symbol ? `$${t.symbol}` : t.name))
								.join(', ')}`
						: 'No trending tokens extracted — page may still be loading',
				type: 'analysis',
			});

			// ── Evaluate top pick ───────────────────────────────────────────────
			if (trending.tokens.length > 0) {
				const pick = trending.tokens[0];
				const label = pick.symbol ? `$${pick.symbol}` : pick.name;
				await push({
					agentId,
					page,
					activity: `Evaluating ${label} — market cap ${pick.marketCap || 'unknown'}`,
					type: 'analysis',
				});

				try {
					await page.act({ action: `Click on the token named "${pick.name}"` });
					await push({ agentId, page, activity: `Opened ${label} detail page`, type: 'screenshot' });

					const detail = await page.extract({
						instruction: 'Extract price, holder count, and recent transaction volume if visible',
						schema: TokenDetailSchema,
					});

					const parts = [];
					if (detail.price) parts.push(`price ${detail.price}`);
					if (detail.holders) parts.push(`${detail.holders} holders`);
					if (detail.volume) parts.push(`vol ${detail.volume}`);
					if (parts.length) {
						await push({ agentId, page, activity: `${label}: ${parts.join(' · ')}`, type: 'trade' });
					}
				} catch {
					await push({ agentId, page, activity: `Could not open ${label} detail page`, type: 'activity' });
				}
			}

			// ── Sleep ───────────────────────────────────────────────────────────
			await push({
				agentId,
				page,
				activity: `Cycle complete — next scan in ${CYCLE_MS / 1000}s`,
				type: 'activity',
			});
			await sleep(CYCLE_MS);
		} catch (err) {
			console.error('[task] cycle error:', err);
			await push({ agentId, page: null, activity: `Error: ${err.message}`, type: 'activity' });
			await sleep(5_000);
		}
	}
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
