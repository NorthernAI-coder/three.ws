# Task 04 — Ownership clarity & "Fork to own your wallet"

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the shared wallet component
> (**task 01**) and the HUD (**task 02**).

## Mission

This is the user's core mental model made visible: **you own the wallet of the
avatar you created; if you take someone else's avatar, you get your own brand-new
wallet.** The backend already enforces this (`agent_identities.user_id`, fork mints
fresh wallets, `meta.forked_from` lineage). Your job is to make it **obvious,
trustworthy, and delightful** in the UI everywhere — and to make "fork to get your
own wallet" a first-class, conversion-driving flow.

## What "ownership clarity" means on screen

Everywhere an agent/avatar + wallet appears, the viewer instantly understands their
relationship to it:

- **Owner:** a clean "Yours" marker on the wallet, full controls (deposit, withdraw,
  vanity, limits, trade, snipe). No ambiguity that these funds are theirs.
- **Visitor (public agent they don't own):** read-only wallet, a clear "owned by
  @creator" attribution that links to the creator, a **Tip** action, and a
  prominent, well-designed **"Fork to get your own"** CTA explaining: forking gives
  you your own copy *with its own wallet you control* — the original owner keeps
  theirs.
- **Forked agent:** show lineage — "Forked from @creator's <name>" (from
  `meta.forked_from`) with a link to the original. Attribution is a feature
  (provenance), not fine print.
- **Logged-out:** read-only + a sign-in / connect prompt before any owner action.

Derive role from `agent_identities.user_id === auth.userId`
([api/_lib/auth.js](../../api/_lib/auth.js)). Never trust the client — owner
controls must also be enforced server-side (they already are; keep it that way).

## The Fork-to-own flow (the headline of this task)

When a visitor wants an avatar, the path to *owning it with their own wallet* must
be one tap and crystal clear:

1. From the wallet chip/HUD or the avatar's profile, a **"Fork & get my wallet"**
   action calls `POST /api/agents/fork` ([api/agents/fork.js](../../api/agents/fork.js)).
2. Show what happens, honestly and beautifully: a new agent owned by you, the GLB
   copied into your namespace, **a fresh Solana + EVM wallet generated and
   controlled by you**, lineage credited to the original creator. No wallet secrets
   are ever copied — say so; it builds trust.
3. On success, drop the user into **their** new agent with **their** new wallet HUD
   open, ready to fund/vanity/trade. The moment of ownership should feel great.
4. Surface fork lineage both ways: the original shows its fork count / network
   (`GET /api/agents/fork?of=:id`); the fork shows its parent.

## Auto-provision on avatar creation (verify + surface)

When a user creates/uploads a 3D avatar, the agent + wallet are auto-provisioned
([api/_lib/avatar-agent.js](../../api/_lib/avatar-agent.js)). Make sure the **first
time a creator sees their new avatar, they also see "your wallet is ready"** — a
real moment that introduces the wallet, its address, and how to fund it. If the
provision is async/best-effort, the UI must handle the brief "provisioning…" state
honestly and then show the real address (poll for the real value; never show a fake
placeholder address).

## Innovation mandate

- **Ownership as status** — an owner's wallet across the app subtly signals "this is
  mine" (a consistent marker/treatment) so a creator feels their portfolio of agents
  is *theirs*. A "My agents & wallets" portfolio roll-up (total value across all
  agents the user owns) is a natural, high-value addition — build it real from the
  owner's agent rows + real balances.
- **Provenance graph** — the fork network is real social/financial lineage. A small,
  tasteful "forked from / forks of" visualization turns attribution into a feature
  people explore. Real data from `meta.forked_from` + the fork-lineage endpoint.
- **Trust copy** — the single most important sentence in this whole program is some
  version of "fork it and you control your own wallet; the creator keeps theirs."
  Make that promise legible at exactly the moment it matters.
- Invent beyond this where it strengthens the ownership story — but never fake a
  wallet, balance, or lineage edge.

## States & edge cases

- Forking your own agent, a private agent (should be blocked/owner-only per the
  endpoint), an agent with no avatar, a deeply-nested fork chain, an agent that's
  been deleted mid-flow.
- Fork while logged-out → prompt sign-in, then resume the fork.
- Provision latency on a brand-new fork → honest "setting up your wallet…" then the
  real address; never block the success screen on a fake value.
- Visitor must never see owner controls; owner must never see a "fork to own" CTA on
  an agent they already own (offer "duplicate" semantics if relevant, but don't
  confuse the two).

## Definition of done

Per the orchestration README. Plus: owner / visitor / forked / logged-out states are
each correct and visible across profile + at least one feed surface; a real fork
end-to-end produces a new agent with a **new, real, distinct** wallet address owned
by the caller (verify the addresses differ from the source and the source is
untouched); lineage attribution renders on both sides; auto-provision moment shows a
real address. No console errors. Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file**
(`prompts/agent-wallets/04-ownership-fork-to-own.md`).
