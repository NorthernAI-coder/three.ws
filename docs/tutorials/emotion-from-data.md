# Emotion from data: wire your agent's face to real APIs and AI

An agent whose face never changes is a puppet. An agent whose expression tracks something real — how a crowd is reacting, how a support queue is trending, how a trade is going — reads as alive. three.ws avatars already carry a full facial-emotion engine under the hood (the same "Empathy Layer" that drives the [AGI](/agi) page's body from its live trading state). This tutorial shows you how to point that engine at data you actually have: a REST API, a live feed, or a real AI model scoring arbitrary text.

You'll build two working pipelines — one with zero AI (a lexicon sentiment score, free, no key), one with a real model in the loop (IBM Granite scoring arbitrary documents into structured emotion) — and the production pattern for running either continuously without jank.

**What you'll build:**
- An agent whose face tracks live sentiment from a real data feed, using only `<agent-3d>`'s public JS API
- A second pipeline where an actual AI model (not a keyword list) reads arbitrary text — reviews, tickets, chat logs, anything — and returns a structured emotion score you feed straight into the avatar
- A continuous polling loop that updates mood over time without snapping or jittering, respecting `prefers-reduced-motion`
- An understanding of the two emotion layers every avatar exposes: transient spikes vs. sustained resting mood

**Prerequisites:** You've completed [first agent](/tutorials/first-agent) or have an `<agent-3d>` element on a page. For the AI lane, a small amount of USDC and familiarity with the [x402 payment flow](/tutorials/pay-for-x402-service) — the call costs $0.04.

---

## Step 1 — The two emotion layers

Every `<agent-3d>` element exposes two methods for driving facial expression, and they answer different questions.

**`expressEmotion(trigger, weight)`** — "something just happened." A transient spike that decays back to neutral on its own. Use it for events: a purchase completed, an error occurred, a message arrived.

```js
agent.expressEmotion('celebration', 0.8); // decays over ~6s
```

Valid triggers: `celebration`, `concern`, `curiosity`, `empathy`, `patience`. `weight` is 0–1 and defaults to 0.7.

**`setMood(valence, arousal, opts)`** — "this is how it's feeling right now, as a baseline." A sustained resting state the avatar drifts toward continuously — a gentle smile and open posture when positive, a worried brow when negative — composited underneath any transient `expressEmotion` spikes rather than fighting them.

```js
agent.setMood(0.4, 0.5); // valence -1..1 (despair→elation), arousal 0..1 (calm→activated)
```

`opts.reducedMotion` (boolean) tells the empathy layer to skip the drift animation and snap directly, for visitors with `prefers-reduced-motion: reduce` set.

The pattern for "emotion from data" is: **your data source feeds `setMood()` continuously** for the resting state, and you fire `expressEmotion()` on top for discrete moments worth calling out. Everything below builds on top of just these two calls — no other API surface is needed.

---

## Step 2 — The free lane: sentiment → mood, no AI required

The platform already runs a public, unauthenticated sentiment scorer over live pump.fun token chat: [`POST /api/social/sentiment-pulse`](../../api/social/sentiment-pulse.js). It pulls recent comments for a token and scores them with an in-repo lexicon (no LLM call, no key, no rate-limit surprises) — good enough to prove the wiring before you reach for a model.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sentiment-driven agent</title>
  <script type="module" src="https://three.ws/cdn/agent-3d.js"></script>
</head>
<body>
  <agent-3d id="agent" agent-id="YOUR_AGENT_ID" mode="inline" width="360px" height="480px"></agent-3d>

  <script type="module">
    const agent = document.getElementById('agent');
    const TOKEN = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump'; // $THREE, or any mint

    async function pulse() {
      const res = await fetch('https://three.ws/api/social/sentiment-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, limit: 100 }),
      });
      if (!res.ok) return null;
      return res.json();
    }

    function applyMood(overall) {
      // scoreSentiment() already returns score in [-1, 1] — that's valence
      // directly. Arousal comes from how much chatter there is and how
      // one-sided it is (a wall of comments that agree reads as "activated").
      const valence = Math.max(-1, Math.min(1, overall.score));
      const lopsidedness = Math.abs(overall.posPct - overall.negPct) / 100;
      const volume = Math.min(1, overall.count / 60);
      const arousal = Math.max(0.15, lopsidedness * 0.6 + volume * 0.4);
      agent.setMood(valence, arousal, {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      });

      // Fire a one-off spike on strong, fresh sentiment so it reads as a reaction,
      // not just a slow drift.
      if (overall.score > 0.5) agent.expressEmotion('celebration', Math.min(1, overall.score));
      else if (overall.score < -0.5) agent.expressEmotion('concern', Math.min(1, Math.abs(overall.score)));
    }

    async function tick() {
      const data = await pulse();
      if (data?.ok) applyMood(data.overall);
    }

    agent.addEventListener('agent:ready', () => {
      tick();
      setInterval(tick, 30_000); // pump.fun comment volume doesn't need faster than this
    }, { once: true });
  </script>
</body>
</html>
```

Save that as `index.html` and open it — no build step, no server, no wallet. Swap `TOKEN` for any Solana mint and the face tracks that token's live chat mood.

---

## Step 3 — The AI lane: real emotion inference over arbitrary data

A lexicon scorer only works on short, informal text and only tells you positive/negative. For real documents — support tickets, product reviews, meeting transcripts, incident reports — you want a model that returns *structured* emotion: a sentiment score plus a breakdown across joy, anger, fear, sadness, surprise, and disgust. `ibm_granite_analyze` (part of the [IBM Granite x402 MCP suite](../ibm-x402-mcp.md)) does exactly this for $0.04/call, no IBM account needed — you pay in USDC, it pays IBM.

This is a server-side call (it needs a wallet to sign the payment), so it lives behind a small endpoint you host yourself and the browser polls. The `@three-ws/x402-fetch` package does the 402 → sign → retry dance for you, the same way `window.X402.pay` does in the browser — see [pay-for-x402-service](/tutorials/pay-for-x402-service) for the full protocol if you want the mechanics.

```js
// mood-from-ai.js — run with `node mood-from-ai.js`, or drop the body of
// scoreEmotion() into any serverless handler (Vercel/Cloud Run/etc).
import { withX402, privateKeyToWallet } from '@three-ws/x402-fetch';

const wallet = privateKeyToWallet(process.env.SOLANA_PRIVATE_KEY); // funds the $0.04 calls
const fetchWithPay = withX402(fetch, wallet);

// High-arousal emotions push the needle further from calm than low-arousal ones.
const AROUSAL_WEIGHT = { anger: 0.9, fear: 0.85, surprise: 0.8, joy: 0.55, sadness: 0.3, disgust: 0.45 };
// Which discrete trigger best represents the dominant emotion, for expressEmotion().
const DOMINANT_TRIGGER = { joy: 'celebration', anger: 'concern', fear: 'concern', sadness: 'empathy', surprise: 'curiosity', disgust: 'concern' };

async function scoreEmotion(document) {
  const res = await fetchWithPay('https://three.ws/api/ibm-mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ibm_granite_analyze',
        arguments: { document, analysis_type: 'sentiment' },
      },
    }),
  });
  const { result } = await res.json();
  const analysis = JSON.parse(result.content[0].text);

  const valence = Math.max(-1, Math.min(1, analysis.sentiment.score));
  const breakdown = analysis.emotion_breakdown || {};
  const dominant = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'joy';
  const arousal = Math.max(
    0.15,
    Object.entries(breakdown).reduce((sum, [k, v]) => sum + v * (AROUSAL_WEIGHT[k] || 0.5), 0),
  );

  return { valence, arousal, trigger: DOMINANT_TRIGGER[dominant], summary: analysis.summary };
}
```

Wire that into a one-route endpoint (`GET /mood?text=...` returning the JSON above), and the browser side is the same shape as Step 2 — swap the `fetch` call and keep `applyMood()`:

```js
async function tick() {
  const res = await fetch(`/mood?text=${encodeURIComponent(latestDocument)}`);
  const { valence, arousal, trigger } = await res.json();
  agent.setMood(valence, arousal, { reducedMotion: prefersReduced });
  if (trigger) agent.expressEmotion(trigger, Math.min(1, Math.abs(valence)) || 0.5);
}
```

Now anything you can turn into a string — a webhook payload, a scraped page, a batch of reviews — can drive the avatar's face through a real model instead of a keyword list.

---

## Step 4 — Running it continuously without jank

Three rules the platform's own production instance of this pattern (see Step 5) follows, worth copying:

1. **Don't poll faster than your data actually changes.** `setMood()` already lerps toward the target over ~1s so a mood *change* reads as a drift, not a cut — but polling every 2s when your source updates every 30s just spends API budget for no visual gain.
2. **Fail to neutral, not to silence.** If the fetch throws or the model call fails, don't skip the tick — call `agent.setMood(0.12, 0.32)` (the avatar's own default resting state) so a broken data source reads as "calm," not as a frozen or crashed face.
3. **Always pass `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')`.** The empathy layer respects it by snapping instead of drifting — free accessibility, one line.

```js
async function tick() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const { valence, arousal, trigger } = await fetchMood();
    agent.setMood(valence, arousal, { reducedMotion });
    if (trigger) agent.expressEmotion(trigger, 0.7);
  } catch {
    agent.setMood(0.12, 0.32, { reducedMotion }); // neutral, not broken
  }
}
```

---

## Step 5 — See it live

The platform runs exactly this pattern in production on [/agi](/agi): [`api/agi/state.js`](../../api/agi/state.js) computes a real cognition vector server-side — valence from live unrealized P&L and on-chain reputation, arousal from how recently the agent last acted — from a real autonomous trading agent's actual track record (never sampled or faked). [`src/agi.js`](../../src/agi.js) polls it every 20s and applies it with the exact `setMood` / `expressEmotion` calls shown above (`applyMood()`, around line 90). Open `/agi` and watch the aura and the avatar's resting expression shift as the underlying trader's P&L moves — that's this tutorial's Step 3/4 pattern, shipped.

---

## Troubleshooting

- **Face never moves.** Confirm `agent:ready` fired before your first `setMood()` call — calling it before boot is silently no-op'd. Wrap your first tick in the `agent:ready` listener as shown in Step 2.
- **Mood snaps instead of drifting.** You're calling `setMood()` far more often than your data changes, so each call interrupts the lerp from the previous one. Widen your poll interval.
- **`expressEmotion` throws no error but nothing happens.** The trigger name is misspelled — it must be exactly one of `celebration`, `concern`, `curiosity`, `empathy`, `patience` (case-sensitive).
- **AI lane 402 loop / never resolves.** Your `SOLANA_PRIVATE_KEY` wallet has no USDC. Fund it with a few cents — see [fund](/tutorials) or the [x402 payment flow](/tutorials/pay-for-x402-service).
- **`analysis.emotion_breakdown` is undefined.** You passed `analysis_type` other than `sentiment` — only that type returns the per-emotion breakdown; the other five types return type-specific fields instead (see [ibm-x402-mcp](../ibm-x402-mcp.md)).

---

## Recap

- `expressEmotion(trigger, weight)` for transient reactions, `setMood(valence, arousal, opts)` for sustained resting state — both are public methods on every `<agent-3d>` element, no library beyond the CDN script.
- The free lane (`/api/social/sentiment-pulse`) proves the wiring with zero AI and zero cost.
- The AI lane (`ibm_granite_analyze` over x402) turns arbitrary documents — not just short informal text — into structured, multi-dimensional emotion for $0.04/call.
- `/agi` is the live, real-money production example of this exact pattern — read its source when you want to see the pattern under real load.

**Related tutorials:** [Trigger the agent from page events](/tutorials/trigger-from-page-events) · [Connect Anthropic or OpenAI as the brain](/tutorials/connect-ai-brain) · [Discover and pay for an x402 service](/tutorials/pay-for-x402-service) · [MCP server for your agent](/tutorials/mcp-server-for-your-agent)
