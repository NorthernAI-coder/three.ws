# Invention 06 — Instant Agent Genesis (selfie → 3D agent → funded wallet → tradeable identity in 60s)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out.

## The invention

The slowest part of every platform is onboarding a new identity. We can collapse it.
Build **Instant Agent Genesis**: from a **text prompt or a photo/selfie**, generate
a real 3D avatar (via the platform's **Meshy** integration), auto-provision its
custodial wallet, mint its on-chain identity, and drop the user into a living,
fundable, tradeable agent — **in under a minute**, with their wallet ready to snipe.

No competitor turns a selfie into a self-custodial 3D trading agent with a verifiable
identity in one flow. We can. This is the front door to everything else in this
program.

## What to build (every step real, no stubs)

1. **Input → 3D model (real Meshy)** — text-to-3D and image/photo-to-3D via the real
   Meshy integration available to the platform. Grep the repo for existing Meshy
   usage first and reuse it; if calling the Meshy MCP/API, use the real endpoints and
   real async task polling (Meshy generation is a real multi-stage job — show its
   **real** progress, never a fake bar). Handle the real lifecycle: queued →
   generating → refining → ready, with real previews.
2. **Model → avatar** — ingest the generated GLB through the real avatar pipeline
   ([avatar-sdk/](../../avatar-sdk), the avatar upload/create path), stored in the
   user's namespace, owned by them.
3. **Avatar → agent + wallet** — the existing auto-provision
   ([api/_lib/avatar-agent.js](../../api/_lib/avatar-agent.js)) creates the
   `agent_identities` row (`user_id = creator`) and the custodial Solana + EVM
   wallet. Surface the **real** wallet address the moment it exists (poll for the
   real value; never show a placeholder).
4. **Agent → on-chain identity** — register the ERC-8004 identity
   ([contracts/](../../contracts)) for real so the agent is verifiable from birth.
5. **Persona + voice** — let the user (or an LLM, via the worker proxy) give the
   agent a persona and a voice (ElevenLabs fields) so it's a character, not a mesh.
6. **The genesis moment** — a single, gorgeous guided flow ending in "meet your
   agent": its face, its vanity-capable wallet, a "fund & snipe" CTA, and a path into
   the co-pilot (`04`) / theater (`01`). Ownership is crystal clear: this is **yours**.

## Real money / real assets — no fakes

- Meshy generation is real and costs real time/credits — wire real task polling and
  real error handling (a failed/timed-out generation is an honest, retryable state).
- The wallet address shown is the real custodial address. The identity registration
  is a real on-chain tx (show the real signature). Never fabricate any of it.
- Photo-to-3D: handle real upload, real consent/privacy (the user's own image),
  real moderation if the pipeline requires it. No storing what you shouldn't.

## Innovation mandate

- **Sub-60s, and it feels magical** — the perceived speed is the product. Parallelize
  real steps (start wallet/identity provisioning while Meshy renders), stream real
  progress, and make the reveal a moment worth sharing (real OG card via
  `/api/agent-share`).
- **Batch genesis** — let a creator spin up a squad of agents from prompts, each with
  its own real wallet and identity. A team of traders, born at once.
- **Remix on genesis** — offer "start from" a public avatar (fork-to-own → fresh
  wallet) as an alternate entry, so genesis and the ownership model are one story.

## States & edge cases

Meshy failure/timeout/low-quality result (honest retry, never ship a broken mesh);
photo rejected by moderation (clear reason); identity-registration tx failure (retry,
never claim registered when it isn't); wallet provision latency (real "setting up"
then real address); user abandons mid-flow (resumable, nothing half-created left
dangling); logged-out (prompt sign-in, then resume). Every path designed and real.

## Definition of done

Per the inventions README. Plus: a real text **and** a real photo input each produce
a real 3D agent with a real custodial wallet and a real on-chain identity, end-to-end
in the browser, with real Meshy progress and a real identity-tx signature; the wallet
address shown is the real one; ownership is unambiguous; handoffs into fund/snipe/
co-pilot work; failures are honest and retryable. No console errors. Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/06-instant-agent-genesis.md`).
