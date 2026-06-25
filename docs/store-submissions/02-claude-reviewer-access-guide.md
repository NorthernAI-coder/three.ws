# Prompt 02 — Claude reviewer access & free verification path

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereq: prompt 01 done (tool inventory exists at `docs/store-submissions/_generated/tool-inventory.md`).

## Context
The Claude Connectors Directory reviewer **calls every tool** and checks that the connector "behaves well when every tool is called." Our problem: 16 of ~17 public tools require an x402 USDC payment. Without a funded wallet, a reviewer hits `PaymentRequired`. The directory **does** allow transactional connectors, but the reviewer must be able to (a) verify the server end-to-end for free, and (b) see clean, self-explanatory responses from the paid tools instead of errors that read as breakage.

Free path that already exists: `forge_free` (text→3D GLB on the free NVIDIA NIM lane — no wallet, no payment). OAuth gives account-scoped read tools (`list_my_avatars`, etc.) for free too.

## Objective
Make the server reviewer-friendly end-to-end and write the **reviewer setup / test-account guide** the submission form requires.

## Tasks
1. **Audit every paid tool's unpaid response.** Call each priced tool without an x402 payload against local dev (`npm run dev`). Confirm it returns a structured `PaymentRequired` (per the v2 MCP transport spec) that is:
   - Not an `isError: true` failure that looks like a crash.
   - Human-readable: states the price, the asset (USDC on Solana), and how to pay. If any tool returns a bare error or a stack trace, fix the handler/boundary so it returns the clean `PaymentRequired` shape. (See `api/_mcp/` payment middleware and `api/_mcp/auth.js`.)
2. **Guarantee a free end-to-end smoke path.** Verify `forge_free` works with no auth and no payment and returns a real GLB URL + viewer link. Verify at least one OAuth-gated read tool works after sign-in. If `forge_free` has any hidden dependency that could fail for a reviewer (rate limit, cold NIM lane), add a graceful fallback/retry so it reliably returns a result.
3. **Provide a funded review path for paid tools (so the reviewer can test them for real).** Choose and implement ONE, documented in the guide:
   - A reviewer OAuth account flagged to bypass x402 (a server-side "review mode" entitlement on a specific account), **or**
   - A small pre-funded Solana test wallet whose key + funding instructions go in the (private) reviewer notes.
   Whichever you pick, it must be real and currently working — no mock bypass. Keep $THREE as the only coin referenced; use USDC for settlement only.
4. **Write `docs/store-submissions/_generated/claude-reviewer-guide.md`** containing: server URL(s), OAuth sign-in steps, the free smoke-test sequence, the funded path to exercise paid tools, expected outputs per tool category, and a "what `PaymentRequired` means" note so the reviewer doesn't read it as a bug.

## Verification (must actually run)
- Script or manually drive: for every tool, one call, capture response. Save transcript to `_generated/claude-tool-call-evidence.md`. Every tool either succeeds or returns a clean `PaymentRequired` — zero unexplained errors.
- `forge_free` end-to-end produces a viewable GLB (paste the URL).
- The funded/bypass review path actually returns a real generated result for at least `text_to_avatar` and one read tool.

## Definition of done
- No paid tool returns a crash-shaped error when unpaid.
- Free + funded review paths both demonstrably work, with evidence saved.
- `claude-reviewer-guide.md` is complete enough that someone with zero context can verify the whole server.

## Hand-off
Report which review path you implemented, any handlers you hardened, and the guide path. Feeds prompt 03 (the submission form references this guide). Commit/push only if the human asks; stage only touched paths; push both remotes.
