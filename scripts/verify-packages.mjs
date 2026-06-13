#!/usr/bin/env node
// Pre-publish verification: pack each package into its real npm tarball, install
// it into a clean throwaway project (resolving its dependencies fresh, exactly
// as an external consumer would), then exercise its real public surface —
// import the SDK, run the CLI bin, or boot the MCP server and request tools/list.
//
// This is the strongest pre-publish gate: it catches files[] gaps, broken
// exports maps, missing/wrong runtime deps, and version-resolution issues that
// in-repo unit tests cannot see.
//
// Usage: node scripts/verify-packages.mjs [name-substring-filter]
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const WORK = mkdtempSync(join(tmpdir(), 'pkg-verify-'));
const TARBALLS = join(WORK, 'tarballs');
mkdirSync(TARBALLS, { recursive: true });

// type: 'import' (node-safe ESM), 'resolve' (browser lib — verify exports resolve
// without executing), 'cli', or 'mcp' (boot stdio server + tools/list).
const PACKAGES = [
  { dir: 'packages/avatar-schema',      name: '@three-ws/avatar-schema',  type: 'import',  expect: ['validate', 'assertValid', 'schema', 'SCHEMA_VERSION'] },
  { dir: 'packages/viewer-presets',     name: '@three-ws/viewer-presets', type: 'import',  expect: ['buildLightRig', 'bloomConfig', 'floorReflectionConfig'] },
  { dir: 'solana-agent-sdk',            name: '@three-ws/solana-agent',   type: 'import',  minExports: 3 },
  { dir: 'agent-payments-sdk',          name: '@three-ws/agent-payments', type: 'import',  minExports: 3 },
  { dir: 'avatar-sdk',                  name: '@three-ws/avatar',         type: 'resolve', subpaths: ['.', './agent', './viewer', './creator', './react'] },
  { dir: 'agent-ui-sdk',                name: '@three-ws/agent-ui',       type: 'resolve', subpaths: ['.'] },
  { dir: 'sdk',                         name: '@three-ws/sdk',            type: 'resolve', subpaths: ['.'] },
  { dir: 'packages/avatar-cli',         name: '@three-ws/avatar-cli',     type: 'cli',     bin: 'three-ws-avatar', siblings: ['packages/avatar-schema'] },
  { dir: 'mcp-server',                  name: '@three-ws/mcp-server',     type: 'mcp',     bin: '3d-agent-mcp',        minTools: 15, env: { MCP_SVM_PAYMENT_ADDRESS: 'THREEsynthetic11111111111111111111111111111' } },
  { dir: 'packages/pumpfun-mcp',        name: '@three-ws/pumpfun-mcp',    type: 'mcp',     bin: 'pumpfun-mcp',         minTools: 20 },
  { dir: 'packages/ibm-watsonx-mcp',    name: '@three-ws/ibm-watsonx-mcp',type: 'mcp',     bin: 'ibm-watsonx-mcp',     minTools: 6, env: { WATSONX_API_KEY: 'test', WATSONX_PROJECT_ID: 'test' } },
  { dir: 'packages/ibm-x402-mcp',       name: '@three-ws/ibm-x402-mcp',   type: 'mcp',     bin: 'ibm-x402-mcp',        minTools: 6, env: { MCP_SVM_PAYMENT_ADDRESS: 'THREEsynthetic11111111111111111111111111111', WATSONX_API_KEY: 'test', WATSONX_PROJECT_ID: 'test' } },
  { dir: 'packages/three-token-mcp',    name: '@three-ws/three-token-mcp',type: 'mcp',     bin: 'three-token-mcp',     minTools: 3 },
  { dir: 'packages/avatar-agent-mcp',   name: '@three-ws/avatar-agent',   type: 'mcp',     bin: 'three-avatar-agent',  minTools: 18 },
  { dir: 'packages/threews-avatar-mcp', name: '@three-ws/avatar-mcp',     type: 'mcp',     bin: 'avatar-mcp',          minTools: 3 },
];

const filter = process.argv[2];
const targets = filter ? PACKAGES.filter((p) => p.name.includes(filter) || p.dir.includes(filter)) : PACKAGES;

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function pack(pkg) {
  const out = sh('npm', ['pack', resolve(ROOT, pkg.dir), '--pack-destination', TARBALLS, '--json'], { cwd: ROOT });
  const meta = JSON.parse(out)[0];
  return join(TARBALLS, meta.filename);
}

function freshConsumer(pkg, tarball) {
  const dir = join(WORK, pkg.name.replace(/[@/]/g, '_'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, version: '1.0.0', type: 'module' }, null, 2));
  // Pack any sibling workspace deps locally so the consumer install resolves
  // them from the tarball (they aren't on the registry yet), in correct order.
  const siblingTarballs = (pkg.siblings || []).map((d) => pack({ dir: d }));
  sh('npm', ['install', ...siblingTarballs, tarball, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, timeout: 360_000 });
  return dir;
}

async function smokeImport(pkg, dir) {
  const code = `import * as m from ${JSON.stringify(pkg.name)};
const keys = Object.keys(m);
const expect = ${JSON.stringify(pkg.expect || [])};
const missing = expect.filter((k) => !(k in m));
if (missing.length) { console.error('MISSING EXPORTS: ' + missing.join(', ')); process.exit(3); }
const min = ${pkg.minExports || 0};
if (keys.length < min) { console.error('TOO FEW EXPORTS: ' + keys.length + ' < ' + min); process.exit(4); }
console.log('exports:' + keys.length);`;
  const out = sh('node', ['--input-type=module', '-e', code], { cwd: dir, timeout: 60_000 });
  return out.trim();
}

function smokeResolve(pkg, dir) {
  const code = `const subs = ${JSON.stringify(pkg.subpaths)};
const results = [];
for (const s of subs) {
  try { results.push(s + '=' + (import.meta.resolve(${JSON.stringify(pkg.name)} + (s === '.' ? '' : s.slice(1))) ? 'ok' : '?')); }
  catch (e) { console.error('UNRESOLVED ' + s + ': ' + e.message); process.exit(3); }
}
console.log(results.join(' '));`;
  return sh('node', ['--input-type=module', '-e', code], { cwd: dir, timeout: 60_000 }).trim();
}

function smokeCli(pkg, dir) {
  const bin = join(dir, 'node_modules', '.bin', pkg.bin);
  const ver = sh(bin, ['--version'], { cwd: dir, timeout: 30_000 }).trim();
  const help = sh(bin, ['--help'], { cwd: dir, timeout: 30_000 });
  if (!/^\d+\.\d+\.\d+/.test(ver)) throw new Error('bad --version: ' + ver);
  if (!/commands/i.test(help)) throw new Error('--help missing commands');
  // exercise a real command end-to-end
  const f = join(dir, 'sample.bin');
  writeFileSync(f, 'three-ws-avatar-cli-smoke');
  const hash = sh(bin, ['hash', f], { cwd: dir, timeout: 30_000 }).trim();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('hash not 64-hex: ' + hash);
  return `v${ver} hash:${hash.slice(0, 8)}…`;
}

function smokeMcp(pkg, dir) {
  return new Promise((res, rej) => {
    const bin = join(dir, 'node_modules', '.bin', pkg.bin);
    const child = spawn('node', [bin], { cwd: dir, env: { ...process.env, ...(pkg.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => finish(new Error('timeout (no tools/list response in 30s)')), 30_000);
    function finish(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch {}
      err ? rej(new Error(err.message + (stderr ? ' | stderr: ' + stderr.slice(0, 200) : ''))) : res(result);
    }
    child.on('error', finish);
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1 && msg.result) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        } else if (msg.id === 2) {
          if (msg.error) return finish(new Error('tools/list error: ' + JSON.stringify(msg.error)));
          const tools = msg.result?.tools || [];
          if (tools.length < pkg.minTools) return finish(new Error(`only ${tools.length} tools (expected >= ${pkg.minTools})`));
          return finish(null, `boots, ${tools.length} tools`);
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1.0.0' } } }) + '\n');
  });
}

const results = [];
for (const pkg of targets) {
  const t0 = Date.now();
  let status = 'PASS';
  let detail = '';
  try {
    const tarball = pack(pkg);
    const dir = freshConsumer(pkg, tarball);
    if (pkg.type === 'import') detail = await smokeImport(pkg, dir);
    else if (pkg.type === 'resolve') detail = smokeResolve(pkg, dir);
    else if (pkg.type === 'cli') detail = smokeCli(pkg, dir);
    else if (pkg.type === 'mcp') detail = await smokeMcp(pkg, dir);
  } catch (e) {
    status = 'FAIL';
    detail = (e.stdout ? e.stdout.toString() + ' ' : '') + (e.stderr ? e.stderr.toString() + ' ' : '') + e.message;
    detail = detail.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  results.push({ name: pkg.name, type: pkg.type, status, detail, secs });
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${pkg.name.padEnd(28)} [${pkg.type}] ${secs}s — ${detail}`);
}

const fail = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length - fail.length}/${results.length} packages verified from a clean install.`);
if (fail.length) { console.log('FAILURES:'); fail.forEach((r) => console.log(`  ${r.name}: ${r.detail}`)); }
try { rmSync(WORK, { recursive: true, force: true }); } catch {}
process.exit(fail.length ? 1 : 0);
