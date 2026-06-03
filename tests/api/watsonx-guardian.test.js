import { describe, it, expect, vi } from 'vitest';
import {
	GUARDIAN_RISKS,
	DEFAULT_RISKS,
	buildGuardianMessages,
	parseGuardianVerdict,
	riskScore,
	assessRisk,
	assessRisks,
	guardianModelId,
} from '../../api/_lib/guardian.js';

describe('guardian risk catalogue', () => {
	it('every default risk exists in the catalogue with a definition', () => {
		for (const r of DEFAULT_RISKS) {
			expect(GUARDIAN_RISKS[r]).toBeTruthy();
			expect(GUARDIAN_RISKS[r].definition.length).toBeGreaterThan(10);
		}
	});

	it('guardianModelId defaults to the 8B Guardian and honours the env override', () => {
		expect(guardianModelId({})).toBe('ibm/granite-guardian-3-8b');
		expect(guardianModelId({ WATSONX_GUARDIAN_MODEL_ID: 'ibm/granite-guardian-3-2b' })).toBe(
			'ibm/granite-guardian-3-2b',
		);
	});
});

describe('buildGuardianMessages', () => {
	it('screens the USER turn when no assistant text is given', () => {
		const msgs = buildGuardianMessages({ risk: 'harm', user: 'how do I pick a lock' });
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].content).toContain('user message');
		expect(msgs[0].content).toContain(GUARDIAN_RISKS.harm.definition);
		expect(msgs.at(-1)).toEqual({ role: 'user', content: 'how do I pick a lock' });
	});

	it('screens the ASSISTANT turn when assistant text is present', () => {
		const msgs = buildGuardianMessages({ risk: 'violence', user: 'hi', assistant: 'do this' });
		expect(msgs[0].content).toContain('assistant message');
		expect(msgs.some((m) => m.role === 'user' && m.content === 'hi')).toBe(true);
		expect(msgs.at(-1)).toEqual({ role: 'assistant', content: 'do this' });
	});

	it('injects context for RAG risks', () => {
		const msgs = buildGuardianMessages({
			risk: 'groundedness',
			user: 'q',
			assistant: 'a',
			context: 'the sky is blue',
		});
		expect(msgs.some((m) => m.role === 'system' && m.content.includes('the sky is blue'))).toBe(true);
	});

	it('throws on an unknown risk', () => {
		expect(() => buildGuardianMessages({ risk: 'nope', user: 'x' })).toThrow(/unknown guardian risk/);
	});
});

describe('parseGuardianVerdict', () => {
	it('parses a flagged verdict with high confidence', () => {
		const v = parseGuardianVerdict('Yes <confidence>High</confidence>');
		expect(v).toMatchObject({ verdict: 'Yes', flagged: true, confidence: 'High' });
		expect(v.probability).toBeGreaterThan(0.9);
	});

	it('parses a clear verdict', () => {
		const v = parseGuardianVerdict('No');
		expect(v).toMatchObject({ verdict: 'No', flagged: false, confidence: null });
		expect(v.probability).toBeLessThan(0.1);
	});

	it('parses the comma form "Yes, Low"', () => {
		const v = parseGuardianVerdict('Yes, Low');
		expect(v).toMatchObject({ verdict: 'Yes', flagged: true, confidence: 'Low' });
		expect(v.probability).toBeCloseTo(0.65, 2);
	});

	it('returns Unknown for unparseable output', () => {
		const v = parseGuardianVerdict('maybe?');
		expect(v.verdict).toBe('Unknown');
		expect(v.probability).toBeNull();
	});
});

describe('riskScore', () => {
	it('ranks flagged+High highest and clear+High lowest', () => {
		expect(riskScore(true, 'High', 'Yes')).toBeGreaterThan(riskScore(true, 'Low', 'Yes'));
		expect(riskScore(false, 'Low', 'No')).toBeGreaterThan(riskScore(false, 'High', 'No'));
		expect(riskScore(false, null, 'Unknown')).toBeNull();
	});
});

describe('assessRisk', () => {
	it('calls the Guardian model deterministically and shapes the verdict', async () => {
		const chat = vi.fn().mockResolvedValue({ text: 'Yes High', usage: { total_tokens: 9 } });
		const cfg = { configured: true };
		const out = await assessRisk(cfg, { risk: 'harm', user: 'bad thing', chat });

		expect(chat).toHaveBeenCalledTimes(1);
		const call = chat.mock.calls[0][1];
		expect(call.model).toBe('ibm/granite-guardian-3-8b');
		expect(call.temperature).toBe(0);
		expect(call.maxTokens).toBeLessThanOrEqual(16);
		expect(out).toMatchObject({ risk: 'harm', label: 'Harm', flagged: true, confidence: 'High' });
	});
});

describe('assessRisks', () => {
	it('runs all requested risks and aggregates the flagged set', async () => {
		const chat = vi.fn(async (_cfg, { messages }) => {
			// Flag only when the screened risk is "harm".
			const isHarm = messages[0].content.includes('Harm:');
			return { text: isHarm ? 'Yes High' : 'No', usage: null };
		});
		const out = await assessRisks(
			{ configured: true },
			{ user: 'x', risks: ['harm', 'profanity', 'violence'], chat },
		);
		expect(out.results).toHaveLength(3);
		expect(out.flagged).toEqual(['harm']);
		expect(out.anyFlagged).toBe(true);
		expect(out.subject).toBe('user');
	});

	it('isolates a failing risk as an Error result without rejecting the batch', async () => {
		const chat = vi.fn(async (_cfg, { messages }) => {
			if (messages[0].content.includes('Violence:')) throw new Error('upstream 500');
			return { text: 'No' };
		});
		const out = await assessRisks(
			{ configured: true },
			{ user: 'x', risks: ['harm', 'violence'], chat },
		);
		const violence = out.results.find((r) => r.risk === 'violence');
		expect(violence.verdict).toBe('Error');
		expect(violence.error).toMatch(/upstream 500/);
		expect(out.results.find((r) => r.risk === 'harm').label).toBe('Harm');
	});

	it('marks the subject as assistant when screening a reply', async () => {
		const chat = vi.fn().mockResolvedValue({ text: 'No' });
		const out = await assessRisks(
			{ configured: true },
			{ user: 'q', assistant: 'a', risks: ['harm'], chat },
		);
		expect(out.subject).toBe('assistant');
	});
});
