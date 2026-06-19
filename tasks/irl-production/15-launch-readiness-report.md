# IRL Launch-Readiness Report — Task 15 (deploy verify + QA gate)

**Date:** 2026-06-19 · **Verdict: 🔴 NOT READY — launch blocked.**
**Gate outcome:** The gate did its job and caught a production failure. Task 15 is
**not** complete; the task file is intentionally retained.

---

## Headline

Two of the six IRL endpoints are **returning HTTP 500 on every path in production**:

| Endpoint | Live prod status | Notes |
|---|---|---|
| `/api/irl/pins` | 🔴 **500** | Fails on the public nearby read, `/mine`, `?mine=1`, **and** `POST`. |
| `/api/irl/interactions` | 🔴 **500** | Same failure shape. |
| `/api/irl/agent-card` | 🟢 200/400/404 | Validates input, reads `irl_pins` correctly (clean `404` for a missing pin/agent). |
| `/api/irl/agent-summary` | 🟢 401 | Auth-gates before DB — correct. |
| `/api/irl/interactions-stream` | 🟢 401 | Auth-gates before DB — correct. |
| `/api/irl/report` | 🟢 405 | POST-only; `GET` correctly rejected. |

**Crucially, none of the six 404.** The stale-deploy-missing-code risk this gate
was created to catch (newer `/api/irl/*` 404ing from a deploy that predates them)
is **absent** — the deployed build contains all six handlers and returns our
structured `wrap()` error envelope, not a Vercel 404. The problem is a **runtime
failure**, not a missing route.

---

## Root cause (narrowed by elimination against live prod)

`/api/irl/pins` 500s on **all four** method/path variants. The only code every one
of those variants shares — in particular `POST`, which skips the GET-only rate
limiter at `api/irl/pins.js:788` — is the very first statement in the handler:

```
api/irl/pins.js:779   await ensureTable();
```

`ensureTable()` (`api/irl/pins.js:344`) runs `CREATE TABLE IF NOT EXISTS` + ~20
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` + `CREATE INDEX` statements. `interactions.js`
has the **same** DDL-on-every-request pattern (`api/irl/interactions.js:126`) and
fails identically. Meanwhile `agent-card.js`, which **reads `irl_pins` without any
DDL**, succeeds — returning a clean `404 "pin not found"` for `?pin=1`, which proves
the production database and the `irl_pins` table are reachable and queryable.

**Conclusion:** the failure is the DDL in `ensureTable()` throwing at runtime in
production — not infra-wide DB loss, not missing endpoints. Most probable causes,
in order:

1. **DDL-permission / lock-timeout in prod.** The prod Neon role cannot execute
   `ALTER TABLE` / `CREATE INDEX` (or the `ACCESS EXCLUSIVE` lock times out under
   the current concurrent-cold-start load). This explains why a DDL-free read
   (`agent-card`) works while every DDL-first handler 500s.
2. **A regression on a not-yet-deployed fix.** `main` advanced through several
   `IRL: pins hardening` commits *during this session*; if prod is built from a
   commit whose `ensureTable()` has a statement that errors and the fix is only on
   newer `main`, prod 500s until redeploy.

I could not disambiguate (1) vs (2) from this sandbox — see "Could not verify".

### Recommended fix (for whoever holds prod access)
- Pull the server-side error for any of the refs below from the Vercel function
  logs — they name the exact failing statement (`column … does not exist`,
  `permission denied for relation irl_pins`, `canceling statement due to lock
  timeout`, etc.) and decide (1) vs (2) immediately.
- If permission/lock: move the DDL out of the per-request hot path into a one-time
  migration (run with a privileged role at deploy time); `ensureTable()` should
  become a no-op assertion in prod, not the thing that gates every read.
- If stale deploy: redeploy `main` and re-run the probes below.

**Reproduce (copy-paste):**
```bash
curl -s -w '\n%{http_code}\n' "https://three.ws/api/irl/pins?lat=40.7&lng=-74&radius=40"
curl -s -w '\n%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' "https://three.ws/api/irl/pins"
curl -s -w '\n%{http_code}\n' "https://three.ws/api/irl/interactions?agent=THREEsynthetic1111"
```
Server-side error refs captured during this gate (quote to Vercel logs):
`d4ec29fa7de09132`, `e2751fecb5285305`, `e194ed0269e08cfc`, `625865f495ca75c2`,
`865bfd2c652c05c4`, `34055f15220a846b`, `e2751fecb5285305`.

---

## What IS verified

- **vercel.json wiring — all six present and correctly ordered.** Each endpoint has
  both a `functions` entry (`vercel.json:172–189`) **and** a route
  (`vercel.json:2016–2041`). `/api/irl/pins/mine` is listed before `/api/irl/pins`
  (specific-before-general), and no `/api/(.*)` catch-all precedes the IRL block, so
  nothing shadows them (the `pump-action-shadows-dedicated-files` trap does not apply
  here).
- **No esbuild clobber.** `head` of every `api/irl/*.js` is source (a `/**` comment),
  not `__defProp`/`createRequire`. The `vercel-build-clobbers-api` trap is clear.
- **Handlers are healthy as source.** All six pass `node --check` (syntax) and export
  a default handler.
- **Production DB is up.** `agent-card?pin=1` → clean `404`; `?id=…` → clean `404`.

---

## Could NOT verify (honest gaps — environment-constrained)

1. **Automated gates (`npm test`, `npm run typecheck`, `npx esbuild`,
   `npm run build:pages`) — NOT RUN.** This sandbox is memory-starved: ~16 GB total
   with **~300 MB free**, and **13+ concurrent agent `npm install` processes** were
   OOM-killing each other (and every install attempt of mine, `rc=143`). A clean
   dependency tree could not be produced even in an isolated git worktree. The only
   dependency-free gate that ran: `node --check` on all six handlers (clean) and the
   clobber check (clean). **These gates must be re-run in a quiescent environment
   before launch** — their result here is *unknown*, not *green*. (A `node_modules`
   left half-installed by the contention was removed.)
2. **Deployed commit SHA — UNCONFIRMED.** The Vercel CLI is not authenticated in this
   sandbox and no response header exposes the build SHA, so prod-vs-`main` parity
   could not be proven. `main` itself moved several commits *during* this session
   (concurrent agents), so the deploy target is in motion.
3. **Real-device matrix (iOS Safari / Android Chrome) — NOT EXECUTED.** No physical
   devices and no camera/WebXR/sensor access from this sandbox. The AR/XR/GPS paths
   cannot be exercised headlessly. Remaining manual steps (unchanged from the task):
   camera permission → Camera AR → Pin here (no-GPS then GPS) → pan-anchoring →
   inspect → x402 pay reachable → rotate → background/foreground; Android adds the
   WebXR "Place on floor" + AR↔XR toggle; both add 320 px, keyboard/SR, reduced-motion.
4. **Live console audit on `/irl` — NOT EXECUTED.** Requires a browser driving the
   live page; not possible from here. Must be done manually, distinguishing real
   errors from the known benign baseline (insights 404, HMR WS, GPU-stall,
   rapier/colyseus).
5. **End-to-end smoke (place → persist → appear-in-range → inspect → report → reap).**
   Blocked outright: the place/persist/read steps all traverse the **500ing** `pins`
   endpoint, so the flow cannot complete in prod until the blocker is fixed.

---

## Definition of Done — status

- [ ] Automated gates green — **NOT RUN** (environment OOM; must re-run clean).
- [x] All six endpoints verified live — **done, and they revealed the blocker.**
- [ ] Six endpoints healthy in prod — **2/6 are 500.**
- [ ] Deploy built from the containing commit SHA — **unconfirmed.**
- [ ] Real-device matrix — **not executed (no devices); steps documented.**
- [ ] Live console clean — **not executed (no browser to live prod).**
- [ ] E2E smoke — **blocked by the `pins` 500.**

## Gate decision

**Do not launch.** Fix the `ensureTable()`/DDL 500 on `pins` + `interactions`,
confirm prod is built from the fix, re-run the automated gates in a quiescent
environment, then exercise the device matrix and console audit. Re-run this gate;
delete Task 15 and its report only when every box above is genuinely checked.
</content>
