#!/usr/bin/env node
// One-off: normalize publishable package.json metadata to the three.ws house style.
// Adds only MISSING top-level fields (never overwrites license/description/exports),
// preserves each file's original indentation and key order, and bumps versions.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');

// dir -> { version, keywords?, engineNode }
const TARGETS = {
  'solana-agent-sdk':            { version: '0.2.0', engineNode: '>=18', keywords: ['three.ws','solana','agent','wallet','keypair','x402','spl-token','swap','jupiter','web3','crypto-payments','agentic'] },
  'avatar-sdk':                  { version: '0.2.0', engineNode: '>=18' },
  'sdk':                         { version: '0.2.0', engineNode: '>=18' },
  'agent-ui-sdk':                { version: '0.2.0', engineNode: '>=18' },
  'mcp-server':                  { version: '1.1.0', engineNode: '>=20' },
  'agent-payments-sdk':          { version: '3.2.0', engineNode: '>=18', keywords: ['three.ws','solana','payments','agent-payments','x402','token-2022','usdc','a2a','cross-chain','pump.fun','agentic','web3'] },
  'packages/viewer-presets':     { version: '0.2.0', engineNode: '>=18' },
  'packages/avatar-cli':         { version: '0.2.0', engineNode: '>=18' },
  'packages/avatar-schema':      { version: '0.2.0', engineNode: '>=18' },
  'agent-protocol-sdk':          { version: '0.2.0', engineNode: '>=18', license: 'MIT', keywords: ['3d-agent','three.ws','agent-protocol','agent-to-agent','a2a','solana','anchor','on-chain','erc-8004','agentic','web3'] },
  'packages/pumpfun-mcp':        { version: '0.2.0', engineNode: '>=20' },
  'packages/ibm-watsonx-mcp':    { version: '0.2.0', engineNode: '>=20' },
  'packages/avatar-agent-mcp':   { version: '1.2.0', engineNode: '>=20' },
  'packages/threews-avatar-mcp': { version: '0.3.0', engineNode: '>=20' },
  'packages/ibm-x402-mcp':       { version: '1.1.0', engineNode: '>=20' },
  'packages/three-token-mcp':    { version: '1.1.0', engineNode: '>=20' },
};

const AUTHOR = 'three.ws <support@three.ws> (https://three.ws)';
const HOMEPAGE = 'https://three.ws';
const REPO_URL = 'https://github.com/nirholas/three.ws.git';
const BUGS_URL = 'https://github.com/nirholas/three.ws/issues';

function detectIndent(raw) {
  const m = raw.match(/\n(\t| +)"/);
  if (!m) return 2;
  return m[1] === '\t' ? '\t' : m[1].length;
}

let changed = 0;
for (const [dir, t] of Object.entries(TARGETS)) {
  const file = resolve(ROOT, dir, 'package.json');
  if (!existsSync(file)) { console.warn('skip (missing):', dir); continue; }
  const raw = readFileSync(file, 'utf8');
  const indent = detectIndent(raw);
  const pkg = JSON.parse(raw);

  pkg.version = t.version;
  if (!pkg.description) console.warn('  WARN no description:', dir);
  if (t.keywords && (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0)) pkg.keywords = t.keywords;
  if (t.license && !pkg.license) pkg.license = t.license;
  if (!pkg.author) pkg.author = AUTHOR;
  if (!pkg.homepage) pkg.homepage = `${HOMEPAGE}/`;
  if (!pkg.repository) pkg.repository = { type: 'git', url: REPO_URL, directory: dir };
  if (!pkg.bugs) pkg.bugs = { url: BUGS_URL };
  if (!pkg.engines) pkg.engines = { node: t.engineNode };
  if (!pkg.publishConfig) pkg.publishConfig = { access: 'public' };
  if (pkg.publishConfig && pkg.publishConfig.access !== 'public') pkg.publishConfig.access = 'public';

  writeFileSync(file, JSON.stringify(pkg, null, indent) + '\n');
  console.log('normalized', dir, '->', pkg.version);
  changed++;
}
console.log(`\n${changed} package.json files normalized.`);
