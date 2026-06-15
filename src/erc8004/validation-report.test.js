import { describe, it, expect } from 'vitest';
import {
	KIND_GLB_SCHEMA,
	SEVERITY,
	reportPassed,
	hashReport,
	buildGlbReport,
	failureReason,
} from './validation-report.js';

const VALIDATED_AT = '2026-06-15T00:00:00.000Z';

const okInspect = {
	fileSize: 1024,
	container: 'glb',
	counts: { totalVertices: 100, totalTriangles: 40 },
};

describe('reportPassed', () => {
	it('passes when there are zero errors', () => {
		const report = buildGlbReport({ url: 'x', inspect: okInspect, suggestions: [], validatedAt: VALIDATED_AT });
		expect(reportPassed(report)).toBe(true);
		expect(report.issues.numErrors).toBe(0);
	});

	it('fails when the model could not be parsed', () => {
		const report = buildGlbReport({ url: 'x', error: 'not a GLB', validatedAt: VALIDATED_AT });
		expect(reportPassed(report)).toBe(false);
		expect(report.issues.numErrors).toBe(1);
		expect(report.issues.messages[0].code).toBe('GLB_PARSE_FAILED');
	});

	it('treats warnings and infos as passing', () => {
		const report = buildGlbReport({
			url: 'x',
			inspect: okInspect,
			suggestions: [
				{ id: 'tri_budget', severity: 'warn', message: 'too many tris' },
				{ id: 'draco', severity: 'info', message: 'compress', estimate: '12 KB' },
			],
			validatedAt: VALIDATED_AT,
		});
		expect(reportPassed(report)).toBe(true);
		expect(report.issues.numWarnings).toBe(1);
		expect(report.issues.numInfos).toBe(1);
		// estimate is folded into the message.
		expect(report.issues.messages.find((m) => m.code === 'DRACO').message).toContain('(12 KB)');
	});

	it('maps critical suggestions to hard errors (fails)', () => {
		const report = buildGlbReport({
			url: 'x',
			inspect: okInspect,
			suggestions: [{ id: 'corrupt', severity: 'critical', message: 'broken buffer' }],
			validatedAt: VALIDATED_AT,
		});
		expect(report.issues.messages[0].severity).toBe(SEVERITY.ERROR);
		expect(reportPassed(report)).toBe(false);
	});
});

describe('hashReport', () => {
	it('is deterministic for identical reports', () => {
		const a = buildGlbReport({ url: 'x', sha256: 'abc', inspect: okInspect, validatedAt: VALIDATED_AT });
		const b = buildGlbReport({ url: 'x', sha256: 'abc', inspect: okInspect, validatedAt: VALIDATED_AT });
		expect(hashReport(a)).toBe(hashReport(b));
		expect(hashReport(a)).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('changes when the bytes (sha256) change — byte-check is part of the proof', () => {
		const a = buildGlbReport({ url: 'x', sha256: 'aaa', inspect: okInspect, validatedAt: VALIDATED_AT });
		const b = buildGlbReport({ url: 'x', sha256: 'bbb', inspect: okInspect, validatedAt: VALIDATED_AT });
		expect(hashReport(a)).not.toBe(hashReport(b));
	});
});

describe('byteCheck', () => {
	it('surfaces the sha256 + byteLength independently of pass/fail', () => {
		const report = buildGlbReport({
			url: 'x',
			sha256: 'deadbeef',
			byteLength: 2048,
			inspect: okInspect,
			validatedAt: VALIDATED_AT,
		});
		expect(report.byteCheck).toEqual({ sha256: 'deadbeef', byteLength: 2048 });
		expect(report.kind).toBe(KIND_GLB_SCHEMA);
	});
});

describe('failureReason', () => {
	it('is empty for a passing report', () => {
		const report = buildGlbReport({ url: 'x', inspect: okInspect, validatedAt: VALIDATED_AT });
		expect(failureReason(report)).toBe('');
	});

	it('returns the single error message', () => {
		const report = buildGlbReport({ url: 'x', error: 'not a GLB', validatedAt: VALIDATED_AT });
		expect(failureReason(report)).toBe('not a GLB');
	});
});
