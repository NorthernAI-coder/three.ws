// Guards against the deploy-artifact failure classes behind the 2026-06-11
// production outage (465 consecutive 500s, every deploy red for 90 minutes):
//
//   1. Committed symlinks — Vercel's function bundler cannot resolve them;
//      data/skills/metamask-* killed every build after ~18 min of tracing.
//   2. Unsatisfied peer dependencies — .npmrc legacy-peer-deps=true means npm
//      never auto-installs peers; helius-sdk 3.0's @solana-program/stake peer
//      silently vanished and every /api/cron/* died with ERR_MODULE_NOT_FOUND.
//   3. Undeclared (phantom) bare imports in api/ — they resolve today only via
//      hoisting from some transitive dep, and disappear on the next dedupe.
//
// The same checks gate the Vercel build (scripts/build-vercel.mjs phase 1);
// running them here means `npm test` catches the regression before a push.

import { describe, it, expect } from 'vitest';
import {
	findCommittedSymlinks,
	findUnsatisfiedPeers,
	findUndeclaredApiImports,
} from '../scripts/audit-deploy-artifacts.mjs';

describe('deploy artifacts', () => {
	it('has no committed symlinks (Vercel function tracing cannot resolve them)', () => {
		expect(findCommittedSymlinks()).toEqual([]);
	});

	it('has no unsatisfied non-optional peer dependencies in the production lock tree', () => {
		expect(findUnsatisfiedPeers()).toEqual([]);
	});

	it('has no undeclared bare imports in api/', async () => {
		expect(await findUndeclaredApiImports()).toEqual([]);
	});
});

describe('findUnsatisfiedPeers logic', () => {
	it('flags a missing non-optional peer (the @solana-program/stake class)', () => {
		const lock = {
			packages: {
				'': { dependencies: { 'some-sdk': '^1.0.0' } },
				'node_modules/some-sdk': {
					version: '1.0.0',
					peerDependencies: { 'missing-peer': '^2.0.0' },
				},
			},
		};
		expect(findUnsatisfiedPeers({ lock })).toEqual([
			{ importer: 'node_modules/some-sdk', peer: 'missing-peer' },
		]);
	});

	it('accepts a peer satisfied at the root', () => {
		const lock = {
			packages: {
				'': {},
				'node_modules/some-sdk': {
					version: '1.0.0',
					peerDependencies: { 'present-peer': '^2.0.0' },
				},
				'node_modules/present-peer': { version: '2.1.0' },
			},
		};
		expect(findUnsatisfiedPeers({ lock })).toEqual([]);
	});

	it('accepts a peer satisfied by a nested install on the ancestor chain', () => {
		const lock = {
			packages: {
				'': {},
				'node_modules/parent/node_modules/child': {
					version: '1.0.0',
					peerDependencies: { 'nested-peer': '^1.0.0' },
				},
				'node_modules/parent/node_modules/nested-peer': { version: '1.0.0' },
			},
		};
		expect(findUnsatisfiedPeers({ lock })).toEqual([]);
	});

	it('respects peerDependenciesMeta.optional', () => {
		const lock = {
			packages: {
				'': {},
				'node_modules/some-sdk': {
					version: '1.0.0',
					peerDependencies: { 'optional-peer': '^2.0.0' },
					peerDependenciesMeta: { 'optional-peer': { optional: true } },
				},
			},
		};
		expect(findUnsatisfiedPeers({ lock })).toEqual([]);
	});

	it('ignores dev-only packages (not installed on Vercel function runtime path)', () => {
		const lock = {
			packages: {
				'': {},
				'node_modules/dev-tool': {
					version: '1.0.0',
					dev: true,
					peerDependencies: { 'missing-peer': '^2.0.0' },
				},
			},
		};
		expect(findUnsatisfiedPeers({ lock })).toEqual([]);
	});
});
