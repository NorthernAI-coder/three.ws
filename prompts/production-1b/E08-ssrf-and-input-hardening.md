# E08 — SSRF + input sanitization + secret-scanning hardening

> Phase E · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
User-supplied URLs are fetched server-side without validation (an SSRF vector that can probe
cloud metadata / internal services), user content isn't centrally sanitized, and there's no
CI guard against committed secrets. Close these before they become an incident.

## Where this lives (real files)
- `api/_lib/auto-rig.js` (`fetchGlbBuffer(url)` — fetches a user URL with no host validation), and similar fetch-user-URL sites (`bake`, avatar import, etc.).
- `api/_lib/validate.js` — Zod schemas (extend with URL guards).
- `api/_lib/http.js` — `redactUrl()` (good; extend coverage).
- User-content surfaces: agent names/descriptions, avatar metadata.

## Build this
1. **SSRF guard:** a shared `assertSafeFetchUrl(url)` (https only; reject localhost, `169.254.*`, `10.*`, `172.16–31.*`, `192.168.*`, `.internal`, link-local, and non-public hosts; optional per-feature allowlist). Apply to every server-side fetch of a user-supplied URL, starting with `auto-rig.js`. Add tests with malicious inputs.
2. **Content sanitization:** centralize sanitization of user-generated text (names, descriptions) used in HTML/OG/embeds to prevent injection; ensure escaping at every render boundary.
3. **Upload validation:** enforce content-type + size + (where feasible) structural validation on uploaded GLBs/images, rejecting malformed files early.
4. **Secret scanning in CI:** add a CI step (e.g. gitleaks/trufflehog) that fails on committed secrets; document remediation. Pairs with **E10**.
5. **Secrets hygiene:** confirm no secret is logged (reuse redaction) and that the watch traps in CLAUDE.md (esbuild bundle overwrite, foreign-history pulls) are not reintroducing secrets.

## Out of scope
- Custody/key handling (**A06**) and auth/session hardening (**B06/G05**).

## Definition of done
- [ ] All server-side fetches of user URLs go through the SSRF guard; malicious inputs are rejected (tested).
- [ ] User text is sanitized/escaped at every HTML/OG/embed boundary; uploads validated.
- [ ] CI fails on committed secrets; no secret appears in logs.
- [ ] `npx vitest run` green; changelog entry (security); committed + pushed to both remotes.

## Verify
- Call the rig/import path with `http://169.254.169.254/...` → rejected; run the secret scanner on the repo → clean; inject `<script>` into an agent name → escaped everywhere it renders.
