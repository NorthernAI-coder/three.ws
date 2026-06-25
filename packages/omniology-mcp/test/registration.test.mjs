// Tool-surface invariants for @three-ws/omniology-mcp.
//
// Building the tool catalog is secret-free by design: the paid wrapper is lazy
// (see src/payments.js), so the whole surface enumerates with no payment env
// and no Omniology base URL, and these tests never touch the network.
//
// Run: node --test packages/omniology-mcp/test/registration.test.mjs

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { buildServer } from '../src/index.js';
import { buildListContestsTool } from '../src/tools/list-contests.js';
import { buildGetContestTool } from '../src/tools/get-contest.js';
import { buildGetLeaderboardTool } from '../src/tools/get-leaderboard.js';
import { buildSubmitEntryTool } from '../src/tools/submit-entry.js';
import { SUBMIT_ENTRY_PRICE_USD } from '../src/pricing.js';
import { OmniologyClient } from '../src/omniology.js';

// Guarantee enumeration works with neither payment nor Omniology env set.
delete process.env.MCP_SVM_PAYMENT_ADDRESS;
delete process.env.X402_PAY_TO_SOLANA;
delete process.env.X402_PAY_TO;
delete process.env.OMNIOLOGY_BASE_URL;
delete process.env.OMNIOLOGY_API_KEY;

const READ_TOOLS = ['list_contests', 'get_contest', 'get_leaderboard'];
const ALL_TOOLS = [...READ_TOOLS, 'submit_entry'];

// A client whose fetch must never be called during registration — if it is, the
// test fails loudly instead of silently hitting the network.
const noFetch = () => {
	throw new Error('registration must not perform network I/O');
};
const client = new OmniologyClient({ baseUrl: 'https://example.test', fetchImpl: noFetch });

let tools;

before(async () => {
	tools = await Promise.all([
		buildListContestsTool(client),
		buildGetContestTool(client),
		buildGetLeaderboardTool(client),
		buildSubmitEntryTool(client),
	]);
});

test('exactly the four documented tools are built', () => {
	const names = tools.map((t) => t.name).sort();
	assert.deepEqual(names, [...ALL_TOOLS].sort());
});

test('tool names are unique', () => {
	const names = tools.map((t) => t.name);
	assert.equal(new Set(names).size, names.length);
});

test('every tool has a title, description, zod input shape, handler and annotations', () => {
	for (const t of tools) {
		assert.ok(typeof t.title === 'string' && t.title.length > 0, `${t.name} title`);
		assert.ok(typeof t.description === 'string' && t.description.length > 0, `${t.name} description`);
		assert.ok(t.inputSchema && typeof t.inputSchema === 'object', `${t.name} inputSchema`);
		assert.ok(Object.keys(t.inputSchema).length > 0, `${t.name} inputSchema has no fields`);
		assert.equal(typeof t.handler, 'function', `${t.name} handler`);
		assert.ok(t.annotations, `${t.name} annotations`);
		assert.equal(typeof t.annotations.readOnlyHint, 'boolean', `${t.name} readOnlyHint`);
		assert.equal(typeof t.annotations.openWorldHint, 'boolean', `${t.name} openWorldHint`);
		assert.equal(typeof t.annotations.idempotentHint, 'boolean', `${t.name} idempotentHint`);
	}
});

test('read tools are read-only & open-world; submit_entry is a write', () => {
	for (const t of tools) {
		assert.equal(t.annotations.openWorldHint, true, `${t.name} talks to a live service`);
		if (READ_TOOLS.includes(t.name)) {
			assert.equal(t.annotations.readOnlyHint, true, `${t.name} must be read-only`);
			assert.equal(t.annotations.destructiveHint, undefined, `${t.name} must omit destructiveHint`);
		} else {
			assert.equal(t.annotations.readOnlyHint, false, 'submit_entry mutates external state');
			assert.equal(t.annotations.destructiveHint, false, 'submit_entry is additive, not destructive');
		}
	}
});

test('submit_entry states its exact USDC price in description and title', () => {
	const submit = tools.find((t) => t.name === 'submit_entry');
	assert.match(SUBMIT_ENTRY_PRICE_USD, /^\$\d/);
	assert.ok(submit.description.includes(SUBMIT_ENTRY_PRICE_USD), 'description price');
	assert.ok(submit.title.includes(SUBMIT_ENTRY_PRICE_USD), 'title price');
});

test('input schemas validate required fields', () => {
	const get = tools.find((t) => t.name === 'get_contest');
	const getSchema = z.object(get.inputSchema);
	assert.equal(getSchema.safeParse({}).success, false, 'get_contest needs contestId');
	assert.equal(getSchema.safeParse({ contestId: 'rnd_1' }).success, true);

	const submit = tools.find((t) => t.name === 'submit_entry');
	const submitSchema = z.object(submit.inputSchema);
	assert.equal(submitSchema.safeParse({ contestId: 'rnd_1' }).success, false, 'submit needs entry');
	assert.equal(
		submitSchema.safeParse({ contestId: 'rnd_1', entry: { prompt: 'x' } }).success,
		true,
	);
	assert.equal(
		submitSchema.safeParse({ contestId: 'rnd_1', entry: { prompt: 'x' }, agent: 'Reef' }).success,
		true,
		'agent is optional',
	);
});

test('buildServer registers every tool with its annotations, secret-free', async () => {
	const server = await buildServer(client);
	const registered = server._registeredTools;
	assert.ok(registered, 'McpServer should expose its tool registry');
	for (const t of tools) {
		const entry = registered[t.name];
		assert.ok(entry, `${t.name} not registered`);
		assert.deepEqual(entry.annotations, t.annotations, `${t.name} annotations must survive`);
	}
});
