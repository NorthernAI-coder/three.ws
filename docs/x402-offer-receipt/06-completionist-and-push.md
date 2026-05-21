# Prompt 06 — Completionist pass + push to both remotes

Prompts [01](01-foundation.md)–[05](05-verification-script.md) have wired and verified the feature. This is the final gate before shipping: audit the diff against [CLAUDE.md](../../CLAUDE.md)'s hard rules, fix anything flagged, then push to both GitHub remotes.

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No mocks. No fake data. No placeholders.**
- **No TODO comments. No stubs.**
- **No commented-out code.**
- **No `throw new Error("not implemented")`.**
- **No `setTimeout` fake-loading.**
- **No fallback sample arrays shipped to production.**
- **Errors handled at boundaries only.**
- Push to **both** `origin` (3D-Agent) **and** `threews` (three.ws) remotes. Never push without explicit user approval. Never force-push.

## Task

### 1. Verify the feature is wired end-to-end

Before auditing, confirm the feature works:

```bash
# With X402_RECEIPT_SIGNING_KEY set in your local .env:
npm run dev &
sleep 3
npm run verify:x402-receipts
# Expect: every OFFER VERIFIED, RECEIPT VERIFIED, exit 0
```

If this fails, **stop** — go back to whichever prompt the failure points to. Do not push a broken feature.

### 2. Run the completionist audit

From [CLAUDE.md](../../CLAUDE.md): "Before stopping on a feature task, run the **completionist** subagent to audit your changed files for the rules above. Fix every item it flags. Then stop."

Run the completionist on the diff:

```bash
git status
git diff main -- api/_lib/ scripts/ package.json .env.example
```

Spawn the completionist subagent with the full diff and the list of changed files. Fix every flagged item — no exceptions. Re-run the audit until it returns clean.

### 3. Sanity check against the full Definition of Done in [00-plan.md](00-plan.md)

Go through the plan's DoD checklist line by line. For each unchecked item, either check it (with evidence) or fix the underlying issue. The list:

- [ ] `X402_RECEIPT_SIGNING_KEY` documented in `.env.example`, real value in local `.env`, configured in Vercel `production` + `preview` (operator confirms this — surface it explicitly if you can't verify Vercel state).
- [ ] `npm test` passes.
- [ ] Paid endpoints return `402` with `extensions["offer-receipt"].signedOffers[]` — verify with the script.
- [ ] Paid endpoints return `200` with `x-payment-response` containing a verifiable `signedReceipt` — verify with the script.
- [ ] `scripts/verify-x402-receipts.js` exits `0`.
- [ ] No handler in `api/x402/*.js` was modified (`git diff main -- api/x402/`).
- [ ] Completionist returns clean.
- [ ] Ready to push to **both** remotes.

### 4. Commit

Stage only the files this feature touched. Do **not** `git add .` — there are unrelated modifications in the working tree (see `git status` from the start of this session: `api/_lib/x402-paid-endpoint.js`, `api/_lib/x402-permit2.js` deletion, `api/_lib/x402-spec.js`, `api/wk.js`, `api/x402-status.js`, `public/x402.js`, `vercel.json`). Some of those may overlap with our changes; verify carefully.

Use the project's commit-message style (check `git log` for tone). Single commit, descriptive:

```
feat(x402): signed offers on 402 + signed receipts on 200

Wires the x402 Offer & Receipt extension into the shared paidEndpoint
wrapper so every paid endpoint signs offers on 402 challenges and
receipts on 200 deliveries. EIP-712 signing under did:pkh, controlled
by X402_RECEIPT_SIGNING_KEY (unset = feature off, byte-identical to
prior behaviour).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

(Pass via HEREDOC per [CLAUDE.md](../../CLAUDE.md)'s git protocol.)

### 5. Push to BOTH remotes

```bash
git push origin <branch>
git push threews <branch>
```

If either push fails, surface the error and stop. **Do not** silently leave the repos out of sync. **Do not** force-push.

### 6. Confirm

After both pushes succeed, print a short summary:

- Files changed (count + key paths).
- Verification script status.
- Both push targets and their resulting commit SHAs.

## Definition of done

- [ ] `npm run verify:x402-receipts` passes end-to-end against a live server.
- [ ] Completionist audit returns clean.
- [ ] All plan DoD items checked.
- [ ] One descriptive commit on the working branch.
- [ ] `git push origin` succeeded.
- [ ] `git push threews` succeeded.
- [ ] Summary printed.

## Stop conditions

- If the completionist flags issues you cannot fix without changing locked-in decisions from [00-plan.md](00-plan.md), surface the conflict instead of overriding the plan unilaterally.
- If `git push` to either remote fails (auth, hook rejection, conflict), surface the error verbatim. Do not retry destructively, do not skip hooks, do not force-push.
- If unrelated modifications in the working tree (the ones listed in step 4) are intermixed with the feature changes, ask the operator how to split before committing. Do not lump unrelated work into the feature commit.
