# Task 04 — Graduation Predictor (calibrated ML model on intel + outcomes)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best.
> Genuinely innovative, not a clone. No mocks/fake data/placeholders/TODO/stubs/`setTimeout`
> fake-loading. Wire 100% with REAL APIs + on-chain data. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception, never promoted.

## ⛓ Chain protocol — STEP 0, before building

Node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before building:
read all `tasks/` + `BACKLOG.md`; invent **10 genuinely new, non-duplicate, real-codebase-grounded
feature ideas**; write each as a full prompt in `tasks/trading-frontier/next/<slug>.md` matching
this file's structure (including this Chain protocol section); append each to `BACKLOG.md` after a
dedup check. Only then build YOUR feature to the production-ready bar (epic README) and `git rm`
this file in the completion commit.

## The invention

We have captured, for thousands of launches, the structural signals at birth (`pump_coin_intel`)
AND the eventual ground-truth outcome (`pump_coin_outcomes`: graduated / pumped / flat / rugged,
`ath_multiple`). That is a labeled dataset nobody else has. Train a **calibrated probability model**
that, for any live launch, outputs "P(graduates) = 73%, P(2x+) = 41%, P(rug) = 12%" with a real
confidence band — and feed it into every trading decision and the UI. The existing `intel/learn.js`
does per-signal win-rates; this is the full multivariate, calibrated successor.

## Context (real, verified)

- Training data: `pump_coin_intel` (features) ⋈ `pump_coin_outcomes` (labels). Existing learning
  loop to supersede/extend: `workers/agent-sniper/intel/learn.js` → `pump_intel_weights`.
- Consumers: `workers/agent-sniper/scorer.js#scoreIntel`, `oracle-gate.js`, the NL backtester
  (`tasks/next-gen-trading/05`), Mission Control (`tasks/next-gen-trading/09`).
- Inference must run server-side (Vercel functions / worker) — no heavy native deps that break the
  serverless build; prefer a lightweight, dependency-light model (e.g. gradient-boosted trees or
  logistic regression implemented/served in-process) trained offline and shipped as weights.

## Goal

A trainable, **calibrated** graduation/outcome model with versioned weights, a recompute/retrain
job, a fast `predictOutcome(features)` used across the platform, and a UI that shows honest
probabilities with calibration evidence.

## What to build

1. **Feature pipeline** — assemble a clean training matrix from `pump_coin_intel` ⋈
   `pump_coin_outcomes` (bundle/organic/concentration/snipe_ratio/fresh_wallet_ratio/entropy/
   quality_score/creator pedigree/category). Handle class imbalance and time-based splits to avoid
   leakage. Persist as a reproducible job under `scripts/` or `workers/`.
2. **Model + calibration** — train a dependency-light classifier for multiple heads (graduates,
   2x+, rug), **calibrate** probabilities (Platt/isotonic) and store reliability data so the
   probabilities mean what they say. Version the weights in a `model_versions` table (version,
   trained_at, metrics: AUC, log-loss, Brier, calibration error, sample_size, feature_importance).
3. **Inference service** — `api/_lib/graduation-model.js#predict(features)` returning calibrated
   probabilities + a confidence band + top contributing features (explainability). Fast, cached per
   mint. Wire into `scoreIntel`/`oracle-gate` (as an optional gate `min_graduation_prob`) and expose
   `GET /api/intel/predict?mint=…`.
4. **Honesty + drift** — show live model metrics + a reliability diagram; track prediction-vs-
   realized drift over time and flag when retraining is due. Never present an uncalibrated or
   stale number as fact.
5. **UI** — a **Prediction** panel (on coin/trade/terminal surfaces): probability bars with
   confidence band, top drivers ("high organic distribution, graduated creator"), and a link to the
   model's live accuracy. All states designed; accessible; responsive.

## Constraints

- Trained only on **real captured data**; never synthesize launches/outcomes. If data is too thin
  for a calibrated estimate, return "insufficient signal" — never a confident fake.
- Probabilities must be calibrated and explainable; surface metrics + drift honestly.
- Serverless-safe inference (no build-breaking native deps). $THREE-only rule.

## Success criteria

- A versioned, calibrated model trains from real intel⋈outcomes with stored metrics + reliability.
- `predict()` returns calibrated probabilities + confidence + drivers, wired into scoring and a
  public endpoint; an optional `min_graduation_prob` gate works.
- Prediction UI renders all states with honest accuracy + drift. Production-ready bar met; chain
  extended. Build/typecheck/test clean. Changelog (tags: feature, improvement). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/04-graduation-predictor.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
