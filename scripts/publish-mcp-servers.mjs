#!/usr/bin/env node
// Publish every three.ws MCP server to npm and the official MCP registry
// (registry.modelcontextprotocol.io), idempotently.
//
// For each stdio package below it:
//   1. checks the version in package.json against npm — publishes to npm if absent
//      (requires `npm whoami` to succeed or NPM_TOKEN in the environment);
//   2. checks the version against the MCP registry — publishes server.json if absent.
//
// Remote-only manifests (root server*.json) skip the npm step.
//
// Registry auth (io.github.nirholas namespace), first match wins:
//   - MCP_REGISTRY_TOKEN env (a registry JWT)
//   - GITHUB_TOKEN env, exchanged via POST /v0/auth/github-at
//   - the GitHub PAT embedded in the `origin` remote URL, same exchange
//
// Usage:
//   node scripts/publish-mcp-servers.mjs --dry-run   # validate + report only
//   node scripts/publish-mcp-servers.mjs             # publish what's missing
//   node scripts/publish-mcp-servers.mjs --only pumpfun-mcp,three-token-mcp

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.modelcontextprotocol.io';

// Every publishable MCP server in this repo. `dir` packages publish to npm
// first; `manifest`-only entries are remote Streamable HTTP servers.
const SERVERS = [
	{ key: 'mcp-server', dir: 'mcp-server', manifest: 'mcp-server/server.json' },
	{
		key: 'pumpfun-mcp',
		dir: 'packages/pumpfun-mcp',
		manifest: 'packages/pumpfun-mcp/server.json',
	},
	{
		key: 'ibm-watsonx-mcp',
		dir: 'packages/ibm-watsonx-mcp',
		manifest: 'packages/ibm-watsonx-mcp/server.json',
	},
	{
		key: 'ibm-x402-mcp',
		dir: 'packages/ibm-x402-mcp',
		manifest: 'packages/ibm-x402-mcp/server.json',
	},
	{
		key: 'avatar-agent-mcp',
		dir: 'packages/avatar-agent-mcp',
		manifest: 'packages/avatar-agent-mcp/server.json',
	},
	{
		key: 'threews-avatar-mcp',
		dir: 'packages/threews-avatar-mcp',
		manifest: 'packages/threews-avatar-mcp/server.json',
	},
	{
		key: 'three-token-mcp',
		dir: 'packages/three-token-mcp',
		manifest: 'packages/three-token-mcp/server.json',
	},
	{ key: 'mcp-bridge', dir: 'mcp-bridge', manifest: 'mcp-bridge/server.json' },
	{ key: 'remote-main', manifest: 'server.json' },
	{ key: 'remote-pumpfun', manifest: 'server-pumpfun.json' },
	{ key: 'remote-3d', manifest: 'server-3d.json' },
	{ key: 'remote-agent', manifest: 'server-agent.json' },
	{ key: 'remote-ibm', manifest: 'server-ibm.json' },
	{ key: 'remote-bazaar', manifest: 'server-bazaar.json' },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg
	? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] || '')
			.split(',')
			.filter(Boolean)
	: null;

const fail = (msg) => {
	console.error(`✗ ${msg}`);
	process.exitCode = 1;
};

function readJson(path) {
	return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

async function npmVersionExists(name, version) {
	const res = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(name).replace('%2F', '/')}`,
	);
	if (res.status === 404) return false;
	if (!res.ok) throw new Error(`npm registry lookup for ${name} → HTTP ${res.status}`);
	const meta = await res.json();
	return Boolean(meta.versions && meta.versions[version]);
}

async function registryVersionExists(name, version) {
	const res = await fetch(
		`${REGISTRY}/v0/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
	);
	if (res.status === 404) return false;
	if (!res.ok) throw new Error(`MCP registry lookup for ${name}@${version} → HTTP ${res.status}`);
	return true;
}

function patFromOriginRemote() {
	try {
		const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
			encoding: 'utf8',
		}).trim();
		const m = /https:\/\/[^:]+:([^@]+)@github\.com\//.exec(url);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

async function getRegistryToken() {
	if (process.env.MCP_REGISTRY_TOKEN) return process.env.MCP_REGISTRY_TOKEN;
	// The origin-remote PAT outranks GITHUB_TOKEN: it belongs to the repo owner,
	// whose io.github.<owner> namespace is the one these manifests publish under.
	// A Codespace GITHUB_TOKEN can belong to a different account entirely.
	const ghToken = patFromOriginRemote() || process.env.GITHUB_TOKEN;
	if (!ghToken) {
		throw new Error(
			'no registry auth: set MCP_REGISTRY_TOKEN or GITHUB_TOKEN, or keep the PAT on the origin remote',
		);
	}
	const res = await fetch(`${REGISTRY}/v0/auth/github-at`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ github_token: ghToken }),
	});
	if (!res.ok) {
		throw new Error(
			`registry github-at exchange failed → HTTP ${res.status}: ${await res.text()}`,
		);
	}
	const body = await res.json();
	if (!body.registry_token)
		throw new Error('registry github-at exchange returned no registry_token');
	return body.registry_token;
}

async function publishToRegistry(manifest, token) {
	const res = await fetch(`${REGISTRY}/v0/publish`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
		body: JSON.stringify(manifest),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`registry publish → HTTP ${res.status}: ${text}`);
	return JSON.parse(text);
}

function npmPublish(dir) {
	execFileSync('npm', ['publish', '--access', 'public'], {
		cwd: resolve(root, dir),
		stdio: 'inherit',
	});
}

let registryToken = null;

for (const server of SERVERS) {
	if (only && !only.includes(server.key)) continue;
	const manifestPath = resolve(root, server.manifest);
	if (!existsSync(manifestPath)) {
		fail(`${server.key}: manifest ${server.manifest} not found`);
		continue;
	}
	const manifest = readJson(server.manifest);
	const { name, version } = manifest;
	console.log(`\n── ${server.key} → ${name}@${version}`);

	// Consistency checks before anything irreversible.
	if (server.dir) {
		const pkg = readJson(`${server.dir}/package.json`);
		if (pkg.version !== version) {
			fail(`${server.key}: package.json ${pkg.version} ≠ server.json ${version}`);
			continue;
		}
		const pkgEntry = manifest.packages?.[0];
		if (!pkgEntry || pkgEntry.identifier !== pkg.name || pkgEntry.version !== version) {
			fail(`${server.key}: server.json packages[0] does not match ${pkg.name}@${version}`);
			continue;
		}
		if (pkg.mcpName !== name) {
			fail(
				`${server.key}: package.json mcpName "${pkg.mcpName}" ≠ server.json name "${name}"`,
			);
			continue;
		}
	}

	// 1. npm
	if (server.dir) {
		const pkg = readJson(`${server.dir}/package.json`);
		const onNpm = await npmVersionExists(pkg.name, version);
		if (onNpm) {
			console.log(`   npm: ${pkg.name}@${version} already published`);
		} else if (dryRun) {
			console.log(`   npm: would publish ${pkg.name}@${version}`);
		} else {
			console.log(`   npm: publishing ${pkg.name}@${version}…`);
			npmPublish(server.dir);
		}
	}

	// 2. MCP registry
	const onRegistry = await registryVersionExists(name, version);
	if (onRegistry) {
		console.log(`   registry: ${name}@${version} already published`);
	} else if (dryRun) {
		console.log(`   registry: would publish ${name}@${version}`);
	} else {
		if (server.dir) {
			const pkg = readJson(`${server.dir}/package.json`);
			if (!(await npmVersionExists(pkg.name, version))) {
				fail(
					`${server.key}: skipping registry publish — ${pkg.name}@${version} is not on npm yet`,
				);
				continue;
			}
		}
		registryToken ??= await getRegistryToken();
		console.log(`   registry: publishing ${name}@${version}…`);
		const out = await publishToRegistry(manifest, registryToken);
		console.log(`   registry: published (status ${out?.server?.status ?? 'ok'})`);
	}
}

console.log(dryRun ? '\nDry run complete.' : '\nPublish run complete.');
