# Task 06 — MCP Wallet Concierge: the full agent wallet lifecycle over MCP

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** (rules,
codespace traps, file map). Then make three.ws the default way an AI agent gets, holds, and runs a
wallet — confidentially, autonomously, paid per call.

You are a senior agent-infrastructure engineer. Today our MCP `vanity_grinder` tool returns a key
in plaintext over the MCP channel (which hosts log). Build the **complete, confidential wallet
lifecycle** for AI agents over MCP: commission → receive (sealed) → fund → label → sign → manage —
all real, all wired, all paid via x402.

---

## Why this is gamechanging

The agent economy is exploding and every agent needs a wallet, but the current options are: hand an
LLM a plaintext private key (which the host logs), or build custody yourself. Neither is acceptable.
three.ws can be the **confidential wallet provider for AI agents**: an agent asks for a branded
wallet, receives it sealed so the host never sees the secret (Task 02), optionally trustless so we
never see it (Task 01), with a verifiable provenance (Task 03), and can then operate it — all
through standard MCP tools it already speaks. This is a wedge into every agent framework.

## What to build (real MCP, real x402, real Solana — no mocks)

Extend `mcp-server/` (study `payments.js`, `tools/vanity-grinder.js`, `lib/*`) with a coherent,
secure tool suite. Each tool is real and wired; each paid tool uses the existing `paid()` x402
wrapper (Solana `exact`); secrets use sealed delivery so the host can't log them.

1. **Commission** — request a vanity wallet (prefix/suffix/word via Task 04 compiler if present;
   keypair/mnemonic/**split-key** format), sealed to a key the agent controls (Task 02). The agent
   gets an address + a sealed secret it alone can open; the host transcript holds only ciphertext.
   Include the proof-of-grind (Task 03).
2. **Receive/open** — a local opener path (SDK/tool) so the agent decrypts its sealed wallet
   without the secret ever transiting a loggable channel in the clear. Document the security model
   in the tool description (as the current tool already warns).
3. **Fund / balance / activity** — real Solana RPC: SOL + USDC + **$THREE** balances, recent
   activity, deposit address/QR. Reuse the existing wallet/balance helpers in `api/_lib/`
   (`agent-wallet.js`, `getSolanaAddressBalances`, etc.) — real chain data only.
4. **Operate** — sign/send a real transaction (memo, transfer) with proper guardrails (the repo has
   `agent-trade-guards.js` — reuse spend limits/policy), so an agent can actually *use* the wallet,
   not just hold it. Confirm on real RPC.
5. **Manage** — label/annotate wallets, list an agent's wallets, link a wallet to a three.ws agent
   identity (cross-pollinate with the avatar/agent system). Real persistence, not in-memory.

Also: ship/refresh an **MCP usage guide** (`docs/`) and ensure the tools are discoverable via the
Bazaar discovery extension the server already uses, so any MCP client (Claude Desktop, Cursor) can
find and use them.

## Security, correctness, edge cases

- **Never** emit a plaintext secret to the MCP channel when the agent supports sealing; keep the
  explicit warning for the legacy plaintext path. Secrets never hit logs/caches in the clear.
- Spend guardrails enforced server-side (limits, allowlists) — an agent can't be prompt-injected
  into draining itself; reuse `agent-trade-guards.js`.
- Idempotency on paid calls (reuse the payment-identifier pattern) so a retried agent call doesn't
  double-charge or double-mint.
- Real persistence + encryption at rest for any custodial material (reuse `api/_lib/secret-box.js`
  / `agent-wallet.js` patterns); for trustless wallets, we hold nothing.
- Handle RPC failures gracefully (the existing helpers never throw on RPC failure — match that).

## Definition of done

- The full lifecycle works from a real MCP client against the **real** server with **real** x402
  payments and **real** Solana RPC: commission (sealed) → open → fund → balance → sign/send →
  manage. No mocks, no fake balances, no simulated signing.
- Secrets are confidential to the agent (sealed); trustless option honored where Task 01 exists;
  proof-of-grind attached where Task 03 exists.
- Tests (vitest + direct `node`); tools discoverable via Bazaar; guardrails enforced.
- `data/changelog.json` entry; `docs/` MCP guide; `STRUCTURE.md` updated.
- **Self-improvement pass:** then extend — e.g., a "wallet policy" tool (budgets, auto-sweep to
  treasury), multi-wallet portfolios, or a one-call "spin up a funded, branded agent wallet"
  primitive. Ship the best.
- **Delete this file** (`prompts/vanity-frontier/06-mcp-wallet-concierge.md`) last. Report the
  tools shipped, how an agent uses them end-to-end, the confidentiality guarantees, and tradeoffs.

This is the tool an autonomous agent reaches for to get a wallet it can trust. Build it that good.
No shortcuts, real everything.
