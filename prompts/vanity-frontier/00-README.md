# Vanity Frontier — agent task suite

A coordinated set of agent briefs that take three.ws's vanity-wallet + x402 + sealed-delivery
stack from "a vanity grinder like everyone has" to **a category nobody else has shipped**:
*trustless, confidential, verifiable, agent-native key generation and delivery over HTTP 402.*

This file is the orchestration guide. It is NOT a task — do not delete it. Each numbered file
IS a task: one agent chat per file. When an agent finishes its task (including the self-improve
pass), it deletes its own prompt file. This README stays as the living index until every task is
done, then a human removes the directory.

---

## The thesis (read this before any task)

Vanity address generators are a commodity. Browser grinders, CLIs, and "pay us and trust us"
web services all exist. They share three fatal weaknesses we are going to eliminate:

1. **Trust.** Every paid grinder *sees the private key it sells you.* You are trusting a stranger
   not to keep a copy and drain the wallet later. This is the single biggest reason people don't
   buy vanity wallets for anything that will hold value.
2. **Exposure.** The secret travels in the clear (TLS at best), lands in server logs, proxy
   caches, MCP host transcripts. Even an honest seller leaks.
3. **No proof.** You can't verify the address was freshly ground, that the pattern is what you
   asked, or that the seller didn't pre-grind 10,000 and sell the "rarest" to the highest bidder.

three.ws already has the raw materials to fix all three and build on top: a production x402 paid
endpoint, a zero-dependency BIP-39 + SLIP-0010 derivation, an ECIES sealed-envelope primitive, a
WASM ed25519 grinder, an MCP server, a Colyseus realtime layer, a 3D/AR avatar system, the $THREE
token, and pump.fun integration. The tasks below compose these into a product wedge.

**The north star:** a buyer (human or AI agent) should be able to commission a branded Solana
wallet over x402, receive it such that *three.ws mathematically cannot have kept the key*, get a
*verifiable certificate* that it was ground fairly, and use it everywhere — and we should be the
only platform on earth that does this.

---

## The tasks

| File | Feature | Why it's gamechanging |
|------|---------|----------------------|
| `01-zero-knowledge-split-key-vanity.md` | **Trustless split-key grinding.** Server grinds against a buyer-supplied partial public key and never learns the full private key. | Removes the #1 objection to paid vanity wallets. No competitor does provably-trustless grinding on Solana. |
| `02-confidential-x402-sealed-compute.md` | **Confidential x402 standard + SDK + decryptors.** Generalize the sealed envelope into a reusable "any paid endpoint can return secrets only the buyer can open" extension, with browser/CLI/SDK openers. | Turns a one-off into infrastructure other builders adopt; positions three.ws as the author of confidential x402. |
| `03-proof-of-grind-provenance.md` | **Verifiable proof-of-grind certificates + public verifier.** Signed attestation of pattern, freshness, and (for split-key) non-custody. | Trust layer; makes a three.ws wallet *provably* fair. Enables a resale market. |
| `04-semantic-vanity-compiler.md` | **Meaningful addresses.** Compile words, owned SNS names, dates, emoji-lookalikes, and multi-constraint patterns into grind plans with honest difficulty + live UX. | Moves vanity from "3 random chars" to identity. Real SNS resolution, real difficulty math. |
| `05-grind-to-earn-pool.md` | **Decentralized grinding pool.** Two-sided marketplace: requesters post bounties (x402/$THREE), workers (browsers + agents) contribute compute and earn, split-key so workers never see the key. | A live network effect + a use for idle compute + a $THREE sink. Realtime via Colyseus. |
| `06-mcp-wallet-concierge.md` | **Agent-native wallet lifecycle over MCP.** AI agents commission, receive (sealed), fund, label, and manage vanity wallets autonomously, paying per call. | The agent economy needs wallets; we make three.ws the default way an AI gets one, confidentially. |
| `07-vanity-as-agent-identity-3d.md` | **Key ceremony + agent identity.** Each three.ws agent's wallet encodes its identity; the grind is a cinematic 3D/AR "birth" with sealed delivery to the owner. | Cross-pollinates the wallet stack with the avatar/3D/AR surfaces; screenshot-worthy, viral. |

Suggested order: 01 and 02 are foundational (trustless core + confidential transport). 03 builds
on them. 04, 06, 07 can run in parallel once 02 exists. 05 depends on 01 (split-key) + 03 (proof).
Agents may run concurrently — heed the shared-worktree rules below.

---

## Non-negotiable operating rules (every task inherits these)

Read `/workspaces/three.ws/CLAUDE.md` in full first. Highlights, plus this session's hard-won
constraints:

- **Innovate. Don't interview.** Pick the most ambitious reasonable interpretation and ship a
  complete, polished, *novel* feature. You are a senior engineer and product thinker. Build the
  best version, not the fastest.
- **No mocks, no fake data, no placeholders, no TODOs, no stubs, no `throw "not implemented"`, no
  fake `setTimeout` loaders.** Real APIs, real endpoints, real data, real crypto. If you write it,
  finish it and wire it end-to-end so a user can reach it through the UI/SDK/MCP.
- **No errors without solutions.** If your ideal approach hits a wall, research the root cause,
  find the correct fix, and ship a working result with an honest fallback. Surface real tradeoffs
  (e.g., wallet-import compatibility) — never hide them, never fake around them.
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name,
  hardcode, or reference any other coin anywhere (code, tests, fixtures, copy, commits). Synthetic
  placeholders only in tests (`THREEsynthetic1111…`).
- **Every user-visible change gets a `data/changelog.json` entry** (holder-readable, plain
  language, correct tags). Don't run `changelog:push`.
- **Definition of done is the CLAUDE.md checklist:** wired + reachable, every state designed
  (loading/empty/error/populated/overflow), accessible, real network calls succeeding, existing
  tests pass, `git diff` self-reviewed, demo-proud.

### This codespace's traps (learned the hard way — obey exactly)

- **NEVER run `npm install` / `npm ci` / `pnpm install`.** The node_modules + npm cache are
  corrupted; install hangs the box. Work with what's installed. (See the user memory note.)
- **`vitest` and some package deps (`zod` in `mcp-server`) are only partially installed**, so the
  vitest runner may not execute here. Verify logic by running modules directly with `node`
  (`node --input-type=module -e "..."`) and `node --check` for syntax. Still WRITE real vitest
  tests — they run in CI.
- **Concurrent agents share this worktree.** Other agents commit on `main` while you work. Stage
  **explicit paths only** — never `git add -A`/`git add .`. Re-check `git status` and
  `git diff --staged` immediately before any commit. Expect files you didn't write to appear.
- **`npx vercel build` overwrites `api/*.js` in place** with esbuild bundles. Don't run it before
  committing; if a large `api/` diff shows `__defProp`/`createRequire` at the top, recover with
  `git restore -- api/ public/`.
- **Push to BOTH remotes** when asked (`git push threeD main` AND `git push threews main`). **Never
  pull/fetch/merge from `threeD`** — it's a push-only mirror; pulls have caused destructive
  overwrites. Pull only from `threews`.
- **Do not commit or push unless the user explicitly asks.** Leave clean, reviewed work.

### Crypto building blocks already proven to work here (reuse, don't reinvent)

- Node built-ins: `crypto.pbkdf2Sync`, `crypto.createHmac`, `crypto.hkdfSync`,
  `crypto.generateKeyPairSync('x25519')`, `crypto.diffieHellman`, AES-256-GCM. Zero-dep, robust.
- `@noble/curves@2.2.0` — import with the **`.js` suffix**: `@noble/curves/ed25519.js` exports
  both `ed25519` and `x25519` plus low-level Edwards point/scalar ops (needed for split-key).
- `@noble/hashes@1.8.0` — `@noble/hashes/sha2.js`, `/sha512.js`, `/hmac.js`, `/pbkdf2.js`,
  `/hkdf.js`, `/utils.js`.
- `@solana/web3.js@1.98.x` (`Keypair`, `PublicKey`), `bs58@6`.

### The existing vanity/x402 surface to read before building

- `src/solana/vanity/` — `grinder-node.js` (WASM ed25519 grinder), `validation.js`,
  `mnemonic.js` + `bip39-english.js` + `mnemonic-grinder.js` (BIP-39 seed phrases),
  `sealed-envelope.js` (ECIES `x25519-hkdf-sha256-aes256gcm/v1`).
- `api/x402/vanity.js` — the live paid endpoint (formats: `keypair`, `mnemonic`; `sealTo` sealed
  delivery; difficulty-tiered pricing; verify→grind→settle ordering; idempotency cache).
- `api/_lib/x402-spec.js`, `api/_lib/x402.js`, `api/_lib/x402/*` — payment verify/settle, Bazaar
  discovery, payment-identifier idempotency, access control.
- `mcp-server/src/` — `payments.js` (`paid()` wrapper, Solana `exact` scheme),
  `tools/vanity-grinder.js`, `lib/mnemonic-vanity.js`.
- `tests/` — `vanity-*.test.js`, `x402-vanity-sealed-envelope.test.js`, `vanity-mnemonic.test.js`.
- `STRUCTURE.md` — maps every product surface to its directory. Read it to orient.

---

## Definition of done for a task (in addition to the feature DoD)

1. Feature built, wired end-to-end, reachable by a real user/agent, every state designed, real
   APIs succeeding. Tests written. Changelog entry added.
2. **Self-improvement pass:** after it works, step back and ask "what would make this 2× better,
   more novel, more useful, more polished?" — then actually do it. Add the keyboard shortcut, the
   verifier, the empty-state illustration, the cross-feature link, the SDK helper. Raise the bar.
3. **Delete your own prompt file** (`prompts/vanity-frontier/<your-file>.md`) as the final step,
   so the suite self-cleans. Do not delete this README or other agents' files.
4. Report back: what you shipped, where it lives, how to reach it, what you improved, and any
   honest limitations/tradeoffs you hit and how you resolved them.
