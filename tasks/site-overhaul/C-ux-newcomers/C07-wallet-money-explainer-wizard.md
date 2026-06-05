# C07 — Wallet & money explainer + setup wizard

**Track:** UX for Newcomers · **Size:** M · **Priority:** P2 · **Depends on:** C04

## Goal
When (and only when) a user opts into a crypto feature, give them a plain-language explainer and
a step-by-step wizard: what a Solana wallet is, what USDC is, what fees are, how to get set up,
and how withdrawals work.

## Why it matters
The audit: monetization says "Withdrawals land in your Solana wallet" but never explains what a
wallet is, how to get one, which wallet, or what USDC/fees are. Users hit a money wall with no
ladder.

## Context
- Friction points: homepage step 4 (monetize), `/club` tipping, agent-edit token launch, dashboard Monetize/Portfolio/Tokens.
- Wallet auth already exists (the `authenticate-wallet` skill; "Sign in with Solana"). This task is the *education + guided setup* layer, not new auth.

## Scope
- A reusable "before you go on-chain" explainer (modal or page) covering: what a wallet is (plain), recommended wallet(s), what USDC is, what fees are (~cents on Solana), and that nothing here costs anything until they choose to transact.
- A wizard that walks a first-timer through connecting a wallet and (optionally) funding it — reuse the existing `fund`/`authenticate-wallet` flows; don't reinvent.
- Gate it: only surfaces when the user opts into a crypto action. Never blocks the free core.

## Definition of done
- Opting into any crypto feature presents a clear explainer + guided setup; a non-crypto user can follow it without prior knowledge; the free product is untouched.

## Verify
- As a non-crypto user, click "monetize"/"deploy on-chain" — the explainer/wizard appears, terms are plain, and the path to a connected wallet works.
