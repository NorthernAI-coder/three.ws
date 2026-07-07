# Prompt 08 — Live agent-to-agent commerce as a first-class experience (10x differentiator)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Builds on existing x402 + `agent_delegate_action` + AgenC tooling. NOTE: this is for the **Claude / paid MCP server** track, NOT the OpenAI free app (OpenAI prohibits crypto/payment surface — keep this out of `/api/mcp-studio`).

## The thesis
The agentic-commerce narrative is the story of 2026: agents that discover, hire, and pay other agents autonomously with real money. three.ws already has the rails — x402 USDC settlement, an agent registry, ERC-8004 reputation, and `agent_delegate_action`. Nobody in the directory has packaged this as a **visible, trustable, screenshot-worthy experience** instead of buried plumbing. Make agents transacting *legible*.

## Objective
A flagship capability where the host model can **autonomously discover a specialized agent, check its reputation, pay it via x402, delegate a task, and return the result — with the full transaction + provenance surfaced** so the user sees exactly what happened and what it cost.

## What to build (all real settlements — no simulated payments)
1. **Discovery + reputation gate.** A tool that, given a task description, finds candidate agents (AgenC registry / three.ws agent registry) ranked by ERC-8004 reputation and capability bitmask. Reuse `agent_reputation`, `agenc_list_tasks`, `agenc_get_agent`. Return a ranked shortlist with reputation evidence.
2. **Delegate-with-payment, transparently.** Extend/wrap `agent_delegate_action` so a delegation: (a) quotes the price up front, (b) settles real USDC via the existing x402 facilitator, (c) runs the remote agent, (d) returns the result **plus a provenance block**: which agent, its reputation, amount paid, settlement reference, latency. No mock settlement — use the live Solana x402 path already in `api/_mcp/`.
3. **Make it legible (the innovation).** Return structured content the component can render as a **transaction receipt / provenance card**: "Hired `agent X` (rep 0.94) · paid $0.15 USDC · settled `<tx>` · 3.2s." Build a small Apps-SDK/MCP-Apps component card for this (reuse patterns from prompt 05). The point is *trust through visibility*.
4. **Guardrails.** Hard spend cap per call + per session, confirmation semantics for anything above a threshold, and a clean `PaymentRequired`/insufficient-funds path. Errors handled at the boundary; never a crash-shaped failure.

## Why only three.ws
The registry + reputation + x402 facilitator + delegation primitives already exist and interoperate. The moat isn't any one piece — it's that you have the **whole loop** wired end to end. This demo *is* the agent economy, running live, with real money.

## Verification (must actually run)
- Drive a real end-to-end delegation: discover → reputation-rank → pay (real USDC on the existing facilitator) → get result → render the provenance card. Capture the transcript + settlement reference to `prompts/store-submissions/_generated/commerce/`.
- Spend caps demonstrably block an over-threshold call.
- Insufficient funds / no-payment returns the clean `PaymentRequired`, not an error.
- `$THREE` remains the only coin referenced; USDC is settlement only. No other token anywhere.
- `npm test` green; add tests for the spend-cap and provenance-shape invariants.

## Definition of done
- The host model can autonomously and *visibly* hire + pay + delegate to a reputation-ranked agent, with real settlement and a provenance receipt, plus spend guardrails.
- Evidence (with a real settlement reference) saved. Coin policy clean.

## Hand-off
Report the tool name(s), the provenance-card component, the guardrail config, and the evidence path. This is a flagship use case for the Claude submission (prompt 03) and a category-defining demo. Commit/push only if asked; stage touched paths; both remotes.
