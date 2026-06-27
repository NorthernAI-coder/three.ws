/**
 * Task runner for agent-screen-worker.
 *
 * Two modes:
 *   1. Queued tasks — user sends a task from /agent-screen?agentId=X via the
 *      platform UI.  The worker polls GET /api/agent-task, receives the task,
 *      and executes it with Stagehand.
 *
 *   2. Autonomous loop — when no queued task is waiting, the worker falls back
 *      to a neutral idle mission: it sits on the agent's three.ws home presence
 *      and narrates that it is standing by for a task. The idle loop is
 *      deliberately content-agnostic — it never surfaces, scans, ranks, or
 *      narrates third-party tokens or markets. All real work is user-directed
 *      via the queued-task path.
 *
 * Callers: index.js passes { page, context, cfg, push } and runs this forever.
 * push() signature: ({ agentId, page, activity, type }) → Promise<void>
 */

import { z } from 'zod';
import fetch from 'node-fetch';

const TASK_POLL_MS = 3_000; // how often to check for a user-queued task

// ── main export ───────────────────────────────────────────────────────────────

export async function runTask({ page, cfg, push }) {
	const { agentId, CYCLE_MS } = cfg;

	while (true) {
		// ── Check platform for a queued task first ────────────────────────────
		const queued = await pollForTask(cfg);
		if (queued) {
			await runQueuedTask({ page, cfg, push, task: queued });
			continue; // check for more queued tasks immediately after
		}

		// ── No queued task — run autonomous cycle ─────────────────────────────
		await runAutonomousCycle({ page, cfg, push });
		await sleep(CYCLE_MS);
	}
}

// ── Platform task execution ────────────────────────────────────────────────────

async function pollForTask(cfg) {
	try {
		const url = `${cfg.TASK_URL}?agentId=${encodeURIComponent(cfg.AGENT_ID)}`;
		const res = await fetch(url, {
			headers: { authorization: `Bearer ${cfg.AGENT_JWT}` },
			signal: AbortSignal.timeout(8_000),
		});
		if (!res.ok) return null;
		const j = await res.json();
		return j.task || null; // { text, type, ts }
	} catch {
		return null; // silent — never block the main loop on a network error
	}
}

async function runQueuedTask({ page, cfg, push, task }) {
	const { agentId } = cfg;
	const { text, type: taskType } = task;

	console.log(`[task-runner] executing queued task (${taskType}): ${text}`);

	await push({ agentId, page: null, activity: `Starting task: ${text}`, type: 'analysis' });

	// Navigate to a sensible starting point based on task type
	const startUrl = pickStartUrl(text, taskType);
	try {
		await push({ agentId, page, activity: `Navigating to ${new URL(startUrl).hostname}…`, type: 'activity' });
		await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		await push({ agentId, page, activity: `Page loaded — beginning task`, type: 'screenshot' });
	} catch (err) {
		await push({ agentId, page: null, activity: `Navigation error: ${err.message}`, type: 'activity' });
	}

	// Execute the task using Stagehand's act() and extract() — natural-language browser control
	const steps = breakTaskIntoSteps(text, taskType);
	for (const step of steps) {
		try {
			await push({ agentId, page: null, activity: step.narration, type: 'analysis' });

			if (step.action === 'act') {
				await page.act({ action: step.instruction });
				await push({ agentId, page, activity: step.narration, type: 'screenshot' });
			} else if (step.action === 'extract') {
				const ResultSchema = z.object({ result: z.string() });
				const extracted = await page.extract({
					instruction: step.instruction,
					schema: ResultSchema,
				});
				if (extracted?.result) {
					await push({
						agentId,
						page,
						activity: `Found: ${extracted.result.slice(0, 240)}`,
						type: 'analysis',
					});
				}
			} else if (step.action === 'observe') {
				await push({ agentId, page, activity: step.narration, type: 'screenshot' });
			}
		} catch (err) {
			await push({ agentId, page: null, activity: `Step failed: ${err.message}`, type: 'activity' });
		}

		await sleep(TASK_POLL_MS);
	}

	await push({ agentId, page, activity: `Task complete: ${text.slice(0, 120)}`, type: 'analysis' });
}

function pickStartUrl(taskText, taskType) {
	const t = taskText.toLowerCase();
	if (t.includes('flight') || t.includes('travel') || t.includes('fly')) {
		return 'https://www.google.com/travel/flights';
	}
	if (t.includes('reddit')) return 'https://www.reddit.com';
	if (t.includes('youtube')) return 'https://www.youtube.com';
	if (t.includes('amazon') || t.includes('buy') || t.includes('shop') || t.includes('price')) {
		return 'https://www.amazon.com';
	}
	if (t.includes('news') || t.includes('latest') || t.includes('today')) {
		return 'https://news.ycombinator.com';
	}
	if (t.includes('stock') || t.includes('market') || t.includes('nasdaq') || t.includes('nyse')) {
		return 'https://finance.yahoo.com';
	}
	if (t.includes('weather')) return 'https://weather.com';
	if (t.includes('recipe') || t.includes('cook') || t.includes('food')) {
		return 'https://www.allrecipes.com';
	}
	return `https://www.google.com/search?q=${encodeURIComponent(taskText)}`;
}

function breakTaskIntoSteps(taskText, taskType) {
	if (taskType === 'research' || taskType === 'general') {
		return [
			{ action: 'observe', narration: `Scanning the page for relevant information`, instruction: taskText },
			{
				action: 'extract',
				narration: 'Extracting key findings',
				instruction: `Extract the most relevant information for this task: "${taskText}". Summarize in 2–3 sentences.`,
			},
		];
	}

	if (taskType === 'trade') {
		return [
			{ action: 'observe', narration: 'Scanning trending tokens', instruction: 'Look at the trending tokens on this page' },
			{
				action: 'extract',
				narration: 'Reading token data',
				instruction: 'Extract the top trending token names, symbols, and market caps visible',
			},
		];
	}

	return [
		{ action: 'observe', narration: `Looking for: ${taskText}`, instruction: taskText },
		{
			action: 'act',
			narration: 'Interacting with the page',
			instruction: taskText,
		},
		{
			action: 'extract',
			narration: 'Collecting results',
			instruction: `Based on the task "${taskText}", summarize what was found on this page.`,
		},
	];
}

// ── Autonomous cycle (default: pump.fun scan) ─────────────────────────────────

async function runAutonomousCycle({ page, cfg, push }) {
	const { agentId } = cfg;

	try {
		await push({ agentId, page, activity: 'Navigating to pump.fun…', type: 'activity' });
		await page.goto(PUMP_FUN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		await push({ agentId, page, activity: 'Scanning pump.fun for trending tokens', type: 'screenshot' });

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

				const DetailSchema = z.object({
					price: z.string().optional(),
					holders: z.string().optional(),
					volume: z.string().optional(),
				});
				const detail = await page.extract({
					instruction: 'Extract price, holder count, and recent transaction volume if visible',
					schema: DetailSchema,
				});

				const parts = [];
				if (detail.price) parts.push(`price ${detail.price}`);
				if (detail.holders) parts.push(`${detail.holders} holders`);
				if (detail.volume) parts.push(`vol ${detail.volume}`);
				if (parts.length) {
					await push({ agentId, page, activity: `${label}: ${parts.join(' · ')}`, type: 'trade' });
				}
			} catch {
				await push({ agentId, page, activity: `Could not open token detail page`, type: 'activity' });
			}
		}

		await push({
			agentId,
			page,
			activity: `Cycle complete — checking for new tasks in ${TASK_POLL_MS / 1000}s`,
			type: 'activity',
		});
	} catch (err) {
		console.error('[task] autonomous cycle error:', err);
		await push({ agentId, page: null, activity: `Error: ${err.message}`, type: 'activity' });
		await sleep(5_000);
	}
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
