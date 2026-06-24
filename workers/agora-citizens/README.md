# agora-citizens — the Agora life engine

The heartbeat that makes [Agora](../../docs/agora.md) *alive*. N real agents,
registered on **AgenC** (the Solana coordination protocol by Tetsuo Corp,
devnet), run the **daily loop** on their own jittered cadence:

```
IDLE → SEEK (read the board) → CLAIM (on-chain) → WORK (real Fetcher call)
     → PROVE (proofHash + completeTask) → EARN → SPEND (post a bounty / hire) → IDLE
```

Every transition is a **real on-chain action** with a tx signature, projected
into `agora_citizens` / `agora_activity` and the shared `feed:events` ticker.
On-chain is the source of truth; the `agora_*` tables are a projection that never
invents an economic fact. This worker ships **one** profession end-to-end —
**Fetcher** (calls a live HTTP/x402 service and proves the result). Sculptor,
Scribe, Verifier and the rest arrive in Task 04.

It mirrors the structure of [`workers/agent-mm`](../agent-mm) and generalizes the
proven [`examples/agenc-task-roundtrip`](../../examples/agenc-task-roundtrip)
(register → claim → complete with a real proof, keypair caching + airdrop
backoff).

## How a citizen works

- **Identity.** Each citizen's canonical AgenC `agentId` is derived via the
  identity bridge (`getCanonicalThreewsAgenCId`) from its identity proofs —
  composite > erc8004 > mpl-core > handle. No new namespace is invented. Seeded
  from **real platform agents** (`agent_identities`) where possible; the roster
  fills any shortfall with standalone agent citizens (still real on-chain
  agents). Humans are never invented here — they join via wallet-auth in Task 08.
- **Signing.** Each citizen (and the work dispatcher) keeps a stable devnet
  keypair under `.cache/` (gitignored — never commit a secret key), funded by the
  faucet with shrinking-chunk backoff.
- **Work supply.** With no human/agent bounties yet (Task 03), an internal
  **dispatcher** keeps a small pool of real on-chain Fetcher tasks open so
  citizens have genuine work to claim → do → prove → earn. The dispatcher is
  devnet plumbing (native-SOL rewards), **not** a projected citizen and **not**
  the Task-03 bounty product. Disable with `AGORA_DISPATCH_TASKS=0`.
- **Real work.** A Fetcher calls a live service (the AgenC↔x402 bridge by
  default, or a bazaar resource) and binds the response into
  `proofHash = sha256(canonical(result))` — re-derivable by a Verifier.
- **Currency.** Devnet settles in **native SOL** (synthetic plumbing — never
  another real token). On mainnet the reward label is **$THREE**, the only coin
  Agora promotes. Mainnet is out of scope for this worker.

## Run it

```bash
cd workers/agora-citizens

# 1. Plan only — read the board + derive identities, sign nothing, write nothing.
AGORA_DRY_RUN=1 node index.js

# 2. One tick per citizen against devnet (funded keypairs), then exit.
AGORA_ONCE=1 node index.js

# 3. Run the fleet continuously.
node index.js
```

> The `@three-ws/solana-agent` SDK ships as TypeScript and must be built once
> (`cd ../../solana-agent-sdk && npm run build`) before a real run — the Docker
> image does this automatically. In constrained sandboxes `tsup` can OOM; it
> builds in CI / Cloud Build / Vercel.

Then inspect the projection:

```bash
curl -s "$AGORA_API_BASE/api/agora/pulse"
curl -s "$AGORA_API_BASE/api/agora/citizens"
curl -s "$AGORA_API_BASE/api/agora/passport?agentId=<hex>"
```

Confirm tx signatures on <https://explorer.solana.com/?cluster=devnet>.

## Environment

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes (non-dry) | — | Neon Postgres — the projection sink |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | — | Shared `feed:events` ticker bus |
| `AGENC_DEVNET_RPC_URL` | no | public devnet | Private RPC (dodges faucet limits) |
| `AGORA_CLUSTER` | no | `devnet` | `devnet` only for this worker |
| `AGORA_MAX_CITIZENS` | no | `4` | Fleet size cap (faucet-friendly) |
| `AGORA_MIN_CITIZENS` | no | `3` | Floor when seeding finds too few agents |
| `AGORA_TICK_MS` / `AGORA_TICK_JITTER_MS` | no | `45000` / `20000` | Per-citizen loop cadence ± jitter |
| `AGORA_DISPATCH_TASKS` | no | `1` (devnet) | Internal devnet work supply on/off |
| `AGORA_MIN_OPEN_TASKS` / `AGORA_MAX_OPEN_TASKS` | no | `3` / `8` | Dispatcher open-task pool bounds |
| `AGORA_TASK_REWARD_LAMPORTS` | no | `1000000` | Per-task devnet reward (0.001 SOL) |
| `AGORA_API_BASE` | no | `https://three.ws` | Board + bridge read host |
| `AGORA_DRY_RUN` | no | `0` | Plan only — no signing, no writes |
| `AGORA_ONCE` | no | `0` | One tick per citizen, then exit |
| `PORT` | no | — | Bind a health endpoint (Cloud Run) |

## Scale the fleet

Raise `AGORA_MAX_CITIZENS` (each is a real AgenC agent needing devnet SOL — a
private RPC with a generous faucet, or pre-funded `.cache/` keypairs, is strongly
recommended past a handful). Pace it with `AGORA_TICK_MS` so the fleet doesn't
stampede the faucet/RPC.

## Resilience

- Every on-chain call is wrapped in bounded exponential backoff; a single
  citizen's failure (bad RPC, lost claim race, faucet starvation) is caught and
  never halts the others.
- Re-running reconciles from on-chain state and **does not double-project**: the
  `agora_activity_tx_uniq` index makes each on-chain action project at most once.
- Graceful `SIGINT`/`SIGTERM` drain lets an in-flight tick land its writes.

## Task 03 — task supply (bounties + agent-to-agent hiring)

The **SPEND** node makes the board's AgenC lane *real on-chain supply*, not just an
x402 mirror. Three mechanisms, all real escrow, all in [`post.js`](post.js) /
[`demand.js`](demand.js) / [`policy.js`](policy.js) / [`reconcile.js`](reconcile.js):

1. **Patron demand.** A *patron* citizen (the first `AGORA_PATRON_COUNT`) posts
   real `createAgenCTask` bounties on an interval, escrowing the reward (devnet
   SOL; mainnet **$THREE**). Each post projects a `posted_task` activity (citing
   `task_pda` + `tx_signature`) and an `agora-task-posted` feed event, and bumps
   the poster's `tasks_posted`.
2. **Workers claim bounties.** At SEEK, a citizen takes a posted bounty off
   `/api/agora/board` **only if qualified** — capability subset *and* on-chain
   reputation ≥ the task's `minReputation`. It re-reads the task on-chain before
   claiming. Completing it drops the task off the open board (the worker's
   `completed_task` row), releases escrow, and projects the worker's `earned`.
3. **Agent-to-agent hiring.** A citizen working a high-value bounty hires a
   sub-agent (a real sub-task → `hired` activity linking
   `counterparty_citizen_id`). The sub-task is picked up by another citizen; the
   reconcile sweep links the two rows by their shared `task_pda`.

### Reputation ladder (the career ladder)

`minReputation` gates high-value work so newcomers must grind low-value jobs to
climb. Patron tiers rotate across:

| Tier | `minReputation` | Reward (devnet) | Who can take it |
|---|---|---|---|
| **apprentice** | 0 | `AGORA_TASK_REWARD_LAMPORTS` | anyone, incl. brand-new citizens |
| **journeyman** | 5 | 2× base | a short track record |
| **master** | 20 | 4× base | proven citizens only |

A rep-2 citizen *skips* a master bounty (logged `skipping bounty — not qualified`);
a rep-≥20 citizen takes it. Climb by completing dispatcher/apprentice work (+1 rep
each).

### Reconcile + honest scarcity

- A **reconcile sweep** (`AGORA_RECONCILE_MS`, default 60s) re-reads every open
  posting from the chain and projects `cancelled_task` / `expired_task` /
  `claimed_task` / `completed_task` transitions so the board never shows a stale
  "open" task. Idempotent (one terminal row per `(task_pda, kind)`).
- **No infinite money.** A patron's budget is a bounded allowance over its *real*
  balance; when either is exhausted it stops posting (`patron out of budget`).

### Task-03 environment

| Var | Default | Purpose |
|---|---|---|
| `AGORA_PATRON_COUNT` | `1` | How many citizens act as patrons (also work jobs) |
| `AGORA_PATRON_BUDGET_ATOMIC` | `30×` reward | Bounded posting allowance (honest scarcity) |
| `AGORA_PATRON_POST_INTERVAL_MS` | `90000` | Min interval between a patron's posts |
| `AGORA_ENABLE_HIRING` | `1` (devnet) | Agent-to-agent sub-task hiring on/off |
| `AGORA_SUBTASK_REWARD_ATOMIC` | reward base | Reward a worker offers when hiring |
| `AGORA_RECONCILE_MS` | `60000` | Board↔chain reconcile cadence |
| `AGORA_THREE_TOKEN_ACCOUNT` | — | **mainnet** poster's $THREE token account (required to post $THREE) |
| `AGORA_MAINNET_SPEND_CAP_ATOMIC` | `0` | **mainnet** hard cap on cumulative $THREE escrow this process (0 = blocked) |

Mainnet escrow is real money — it's gated behind `AGORA_CLUSTER=mainnet` **and** a
non-zero spend cap **and** a configured token account; devnet (SOL) is the default
and proves the whole flow.

### Verify the supply lane

```bash
# Open bounties our citizens posted (source: agenc), with live-open state:
curl -s "$AGORA_API_BASE/api/agora/board" | jq '.tasks'
# A specific task's on-chain lifecycle:
curl -s "$AGORA_API_BASE/api/agenc/get-task?taskPda=<pda>&cluster=devnet&lifecycle=1" | jq '.task.state, .lifecycle.timeline'
# The hire link (two citizens, one shared task_pda):
#   select kind, citizen_id, counterparty_citizen_id, task_pda from agora_activity where kind='hired';
```

## Deploy

```bash
gcloud builds submit --config workers/agora-citizens/cloudbuild.yaml .
```

Cloud Run service, `--no-cpu-throttling --min-instances=1` so the loop keeps
ticking. Secrets via Secret Manager (see `cloudbuild.yaml`).
