# Launch Studio — coin-launch use cases

The **Launch Studio** ([three.ws/launch-studio](https://three.ws/launch-studio))
is a catalog of 50 ready-made coin-launch recipes. Each recipe pulls a live
signal, turns it into a concrete coin identity, and routes the coin's creator
fees — then previews exactly what it would mint **right now** before you launch
on pump.fun in one click.

It's built on the shared [launch use-case engine](../api/_lib/launch/README.md).

## Two kinds of recipe

| Mode | What it mints | Where fees go |
|---|---|---|
| **Reward** (`attribution`) | A coin *for* a real subject — a trending GitHub repo or creator. | The subject's GitHub account, via the fee-sharing / social-fee system. This is the `$THREE → @nirholas` pattern, automated. |
| **Theme** (`narrative`) | An original coin riding a live cultural, news, or onchain narrative. | The launching agent (creator fees) — delegate later from the [fees panel](../public/studio/fees-panel.js). |

## The catalog (50 recipes, 6 categories)

- **GitHub (12)** — trending repos and creators, by language (Rust, TypeScript,
  Python, Go, Solidity, AI/ML notebooks), fresh weekly breakouts, surging
  established projects, and top builders. Fees route to the repo owner / creator.
- **Onchain (8)** — pump.fun venue signals: breakout categories, oracle
  conviction sectors, blended momentum, AI-agent and degen metas.
- **News (8)** — Hacker News tech zeitgeist, Google search surges, Wikipedia top
  events, and crossover blends.
- **Culture (10)** — fresh confirmed memes, Reddit hot, X chatter, and broad
  meme mixes.
- **Events (6)** — what the world is looking up: Wikipedia top-of-day, live search
  spikes, sports/entertainment moments.
- **Community (6)** — ecosystem contributors and builders (reward coins) plus
  cross-source culture blends.

## How a preview works

1. Open `/launch-studio` and pick a recipe.
2. The studio calls the read API and renders the coins the recipe would mint from
   **live data** — name, ticker, description, source signal, and the reward
   routing for each.
3. Hit **Launch this coin** to open the existing [`/launch`](https://three.ws/launch)
   wizard with the identity prefilled, then mint on-chain from your wallet or an
   agent's custodial wallet.

For reward coins, after the coin graduates you set the GitHub recipient in the
[fees panel](../public/studio/fees-panel.js) (type a `@username` → 100%, or
import a repo's contributors to split) — see the fee-sharing flow.

## API

Public, rate-limited, read-only. Reward routing in `preview` is **intent-only** —
it never reveals whether a GitHub user has a linked wallet; the concrete address
resolves on the authed launch path.

### List recipes

```
GET /api/pump/launch-studio?action=list[&category=github&mode=attribution]
```

```json
{
  "count": 50,
  "categories": ["github", "onchain", "news", "culture", "events", "community"],
  "use_cases": [
    {
      "id": "github-trending-repos",
      "title": "Trending GitHub repos → reward coins",
      "description": "...",
      "category": "github",
      "mode": "attribution",
      "tags": ["github", "attribution", "rewards"],
      "source": "github-repos",
      "reward_label": "Creator fees → the repo owner"
    }
  ]
}
```

### Preview a recipe (live)

```
GET /api/pump/launch-studio?action=preview&id=github-fresh-breakouts&limit=6
```

```json
{
  "id": "github-fresh-breakouts",
  "mode": "attribution",
  "network": "mainnet",
  "generated_at": "2026-06-30T23:00:00.000Z",
  "items": [
    {
      "subject": "acme/widget",
      "signal": { "source": "github", "detail": "★5243 · Python" },
      "identity": { "name": "widget", "symbol": "WIDGET", "description": "...", "image": "https://github.com/acme.png" },
      "reward": { "kind": "github-owner", "github_username": "acme", "mode": "pending", "note": "Creator fees route to @acme — resolved to their wallet (or a social-fee escrow) at launch." }
    }
  ]
}
```

## Related

- [Launch use-case engine](../api/_lib/launch/README.md) — internals + how to add a recipe.
- [Coin Launches](./coin-launches.md) — the underlying launch mechanism.
- [Launch a Coin](https://three.ws/launch) — the wizard each recipe hands off to.
- Fee sharing & GitHub reward routing — [`public/studio/fees-panel.js`](../public/studio/fees-panel.js).
