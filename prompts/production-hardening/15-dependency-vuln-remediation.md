# 15 · Remediate vulnerable dependencies (axios et al.)

> **Phase 3 — Security** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
`npm audit` surfaces high-severity issues — most notably **axios** (multiple CVEs incl. SSRF bypass,
prototype pollution, credential leakage). Given this codebase fetches user-supplied/remote URLs in
several paths, a vulnerable HTTP client is a direct SSRF/abuse risk *even with* the custom SSRF guard.
Patch or eliminate the risky deps and put a recurring audit in CI so they can't creep back.

## Context (read first)
- `CLAUDE.md`; memory: "Prefer vetted OSS, additive."
- SSRF defense: `api/_lib/ssrf.js` / `guardedFetch` (DNS-pin, private-IP blocklist) — the source of truth; native `fetch`/`undici` go through it.
- Flagged by audit: `axios` (14+ CVEs), `@opentelemetry/core` (<2.8.0 unbounded memory), `@libp2p/kad-dht` (<16.2.6 disk exhaustion, via helia), `@ai-sdk/provider-utils` (via `qwen-ai-provider`, no fix).

## Build this
1. **Inventory** — run `npm audit` (and `npm ls axios` etc.) and list exactly where each flagged dep is used, transitive vs direct.
2. **axios** — upgrade to the latest patched line; better, **migrate first-party axios usage to `guardedFetch`/native fetch** so all outbound HTTP goes through the SSRF guard. Where a transitive dep pins old axios, override via `package.json` `overrides`.
3. **Other flagged deps** — bump `@opentelemetry/core` ≥2.8.0 and `@libp2p/kad-dht`/`helia` to patched versions (via `overrides` if transitive). For `qwen-ai-provider` (no fix): assess whether it's actually used; if not, remove it; if yes, sandbox/limit its exposure and document the residual risk.
4. **CI guard** — add `npm audit --audit-level=high` (or `better-npm-audit` with a tracked allowlist for accepted/unfixable items) to CI; document any accepted exceptions with rationale + review date.
5. **Verify** — full test suite + `npm run build` succeed after upgrades; no runtime regressions in payment/forge/image-fetch paths.

## Files likely in play
`package.json` (deps + `overrides`), `package-lock.json`, first-party axios call sites → `guardedFetch`, `.github/workflows`, a short `docs/security/dependency-policy.md`.

## Definition of done
- [ ] `npm audit --audit-level=high` clean (or every remaining item explicitly accepted + documented).
- [ ] No first-party outbound HTTP bypasses the SSRF guard.
- [ ] CI fails on new high/critical advisories.
- [ ] Full test suite + build green post-upgrade.
- [ ] Changelog: **security** entry ("hardened dependencies / patched known vulnerabilities").

## Guardrails
Follow CLAUDE.md. Don't blanket-bump majors blindly — verify each upgrade against the suite. Keep the lockfile consistent (the repo uses workspaces; mind `npm ci`). Push both remotes.
