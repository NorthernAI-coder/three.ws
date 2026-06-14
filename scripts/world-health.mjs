#!/usr/bin/env node
// Health check for world.three.ws (Hyperfy on Cloud Run).
//
// Connects as a spectator, pulls the world snapshot, and verifies that every
// asset referenced by a blueprint actually exists in asset storage. A missing
// asset is exactly how the world broke on 2026-06-12: the $scene script file
// vanished from the GCS bucket, the scene app crashed on every client, the
// ground unloaded, and every player fell into the void.
//
// Usage:  node scripts/world-health.mjs [--assert-protected]
// Exit 0 = healthy, 1 = problems found (suitable for cron/uptime alerting).
//
// --assert-protected  treat an unprotected world (no ADMIN_CODE) as a hard
//                     failure, not just a warning. Use it as a post-deploy gate
//                     after deploy/world/apply-hardening.sh:
//                       node scripts/world-health.mjs --assert-protected

import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WORLD = process.env.WORLD_URL || 'https://world.three.ws'
const ASSERT_PROTECTED = process.argv.includes('--assert-protected')

// msgpackr is only needed by this script; provision it in a cache dir so the
// shared package.json/lockfile stay untouched.
const depDir = path.join(os.homedir(), '.cache', 'three-ws-world-health')
if (!existsSync(path.join(depDir, 'node_modules', 'msgpackr'))) {
  execSync(`npm install --prefix ${depDir} --no-audit --no-fund --silent msgpackr ws`, { stdio: 'inherit' })
}
const require = createRequire(path.join(depDir, 'node_modules', '/'))
const { Packr } = require('msgpackr')
const WebSocket = require('ws')

const problems = []

const status = await (await fetch(`${WORLD}/status`)).json()
console.log(`/status: uptime=${status.uptime}s protected=${status.protected}`)
if (!status.protected) {
  const msg = 'world is UNPROTECTED — no ADMIN_CODE set, every visitor has build rights (run deploy/world/apply-hardening.sh)'
  // --assert-protected makes this a hard failure (post-deploy gate); otherwise
  // it is a warning so an asset-only health run still reports cleanly.
  if (ASSERT_PROTECTED) problems.push(msg)
  else console.warn(`WARNING: ${msg}`)
}

const snapshot = await new Promise((resolve, reject) => {
  const packr = new Packr({ structuredClone: true })
  const ws = new WebSocket(`${WORLD.replace('http', 'ws')}/ws?name=healthcheck`)
  ws.binaryType = 'arraybuffer'
  const timer = setTimeout(() => reject(new Error('no snapshot within 15s')), 15000)
  ws.on('message', buf => {
    const [id, data] = packr.unpack(Buffer.from(buf))
    if (id !== 0) return // 0 = snapshot
    clearTimeout(timer)
    ws.close()
    resolve(data)
  })
  ws.on('error', reject)
})

console.log(`snapshot: ${snapshot.blueprints.length} blueprints, ${snapshot.entities.length} entities`)

const assetRefs = new Map() // filename -> [blueprint names]
const collect = (obj, owner) => {
  for (const m of JSON.stringify(obj).matchAll(/asset:\/\/([a-f0-9]{64}\.\w+)/g)) {
    if (!assetRefs.has(m[1])) assetRefs.set(m[1], new Set())
    assetRefs.get(m[1]).add(owner)
  }
}
for (const bp of snapshot.blueprints) collect(bp, `blueprint ${bp.id} (${bp.name || 'unnamed'})`)
collect(snapshot.settings, 'world settings')

console.log(`checking ${assetRefs.size} referenced assets...`)
const checks = [...assetRefs.keys()].map(async file => {
  const res = await fetch(`${WORLD}/assets/${file}`, { method: 'HEAD' })
  if (!res.ok) problems.push(`asset MISSING (${res.status}): ${file} — used by ${[...assetRefs.get(file)].join(', ')}`)
})
await Promise.all(checks)

const scene = snapshot.blueprints.find(b => b.id === '$scene')
if (!scene) problems.push('no $scene blueprint — the world has no environment')

if (problems.length) {
  console.error(`\nUNHEALTHY — ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\nHEALTHY — all referenced assets present, scene intact.')
