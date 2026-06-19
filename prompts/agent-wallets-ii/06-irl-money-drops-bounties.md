# Task 06 — IRL Money Drops & Bounties: value placed in the real world

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

three.ws agents live **in the real world** via IRL/AR placement ([src/irl.js],
[api/irl/pins.js], [api/irl/agent-summary.js], proof-of-presence fix tokens). No wallet
on earth can do this: **drop money at a place.** A user (or an agent, via an intent) leaves
SOL/USDC pinned to a real-world location or to a specific agent placed there; whoever
**physically goes there** (verified by the same proof-of-presence the IRL system already
mints) and opens AR can **claim** it. Agents can also post **bounties** in the world
("come find me / complete this and get paid").

This makes money **spatial and playful** — a treasure hunt, a real-world airdrop, a
location-based tip jar for street-performing agents. It's a genuinely new primitive that
only a platform with embodied agents + AR + wallets could ship, and it's irresistible to
demo.

## How to build it for real (real funds, real location proof, no fakes)

1. **Funding the drop (non-custodial escrow done honestly).** A drop locks **real**
   value. Decide and implement a real custody model — do NOT fake it:
   - **Preferred:** an on-chain escrow/claim so funds are trustless (a dedicated drop
     keypair or program-controlled account funded by the creator's signed transfer; the
     claim releases to the verified claimant). If a suitable program/SDK primitive exists,
     wire it end-to-end.
   - **Otherwise:** a platform-custodied escrow that reuses the existing custodial wallet
     machinery ([api/_lib/agent-wallet.js], encryption via [api/_lib/secret-box.js], audit
     logging, spend-limit semantics) — the creator's funds are moved into a real, tracked
     escrow row and released by a real server-signed transfer on a valid claim. Either way
     the money is **real and accounted for**, every move is audit-logged, and refunds are
     possible if a drop expires unclaimed (auto-refund to the creator).
2. **Placing the drop.** Reuse the IRL pin + proof-of-presence pipeline ([api/irl/pins.js],
   the fix-token flow in [src/irl.js]) so a drop is anchored to a real, attested location
   (and optionally to a specific placed agent). Drop config: `{ asset, amount, radius,
   expiry, claimRule (first|each-once|quiz), maxClaims }`. Creator signs the funding;
   server records the drop + escrow.
3. **Claiming.** A claimant in IRL/AR mode near the drop, with a **valid proof-of-presence
   fix token** (the system already enforces this for nearby reads/pins — reuse it; do not
   weaken it), claims to **their own** wallet. Server verifies: location proof, radius,
   not-expired, claim-rule/limits, no double-claim (idempotent per claimant). On success,
   the real release transfer executes and is audit-logged; the claimant gets a real
   receipt (Solscan link).
4. **Bounties.** A bounty is a drop with a completion condition (e.g. "be here," "chat with
   this agent," "answer the agent's question right"). Agents can post bounties via the
   Intents engine (task 02) within their spend policy. Completion is verified server-side
   against real signals (presence, a real chat event, etc.) before release.

## The UI

- **In IRL/AR ([src/irl.js]):** drops/bounties appear as world-anchored 3D markers (a
  glowing coin/chest in the wallet-violet family) with distance + value; tapping a nearby
  one (with valid presence) opens a claim sheet → real claim → celebratory receipt. Out of
  range = clear "get closer" affordance with distance.
- **Create flow:** "Drop money here" / "Post a bounty" in the IRL UI (and from an agent's
  wallet for agent-posted bounties). Funding uses the visitor-signed transfer path
  (reuse [src/shared/agent-tip.js] signing) for user-funded drops.
- **A map/list** of nearby + my drops/bounties (active, claimed, expired, refunded), each
  with real status + receipts. Reuse the discovery panel patterns in [src/irl/discovery.js].
- States: creating, funding (real signature), active, in-range/claimable, claiming,
  claimed (receipt), expired→refunded, error. a11y (the AR markers must have a parallel
  accessible nearby-list), reduced-motion, and clear safety/expiry messaging.

## Ownership / viewer states

- **Creator (user or agent owner):** funds, sets rules, can cancel an unclaimed drop
  (real refund). Agent-posted bounties are owner-armed and spend-limited.
- **Claimant (any user):** claims to their own wallet, presence-verified, once.
- **Logged-out:** sees drops exist; connect + verify presence to claim.

## Definition of done (in addition to 00's list)

- Drops lock **real** value in a real, audited escrow; claims release **real** funds to
  the claimant's wallet; unclaimed drops **auto-refund** the creator. No fake balances.
- Location/claim gated by the existing proof-of-presence (not weakened), radius, expiry,
  claim-rule, and idempotent per claimant (no double-claims, no race exploits — serialize
  the claim).
- Bounties post via intents within spend policy; completion verified against real signals.
- Wired into IRL/AR with world markers + accessible nearby list; create/claim/refund all
  real; every state designed.
- Edge cases: two people claim simultaneously (only one wins, atomically), spoofed
  location (rejected by proof-of-presence), expiry mid-claim, RPC failure mid-release
  (retry, never lose or double-spend funds), drop in a place no one visits (refund).

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g.
sponsored "agent treasure trails" across multiple pins, or surfacing live drops as pulses
on the Money Constellation (task 04) and as a discovery hook. Then **delete this file**.
