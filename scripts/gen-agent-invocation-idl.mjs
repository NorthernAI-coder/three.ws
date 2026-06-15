#!/usr/bin/env node
/**
 * Regenerate the committed Anchor IDL at contracts/idl/agent_invocation.json
 * from the SDK's typed IDL (agent-protocol-sdk/src/idl.ts — the source of truth
 * kept in sync by hand with the on-chain program). Run after changing the IDL or
 * the program id:
 *
 *   npm --prefix agent-protocol-sdk run build   # emit dist/
 *   node scripts/gen-agent-invocation-idl.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { IDL } = require('../agent-protocol-sdk/dist/index.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'contracts/idl/agent_invocation.json');

// Strip the `as const` readonly-ness and emit plain JSON Anchor tooling consumes.
const idl = JSON.parse(JSON.stringify(IDL));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(idl, null, 2) + '\n');
console.log(`wrote ${path.relative(root, out)} (program ${idl.address})`);
