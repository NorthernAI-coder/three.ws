# E07 — `/ibm` suite: shared shell & cross-nav

**Track:** Improve Features · **Size:** M · **Priority:** P3

## Goal
Give the seven IBM demos a consistent shared shell (nav between them, common header/footer,
unified styling) so the flagship partner suite feels like one cohesive showcase.

## Why it matters
The `/ibm` suite is a marquee partnership surface (galaxy, oracle, trust-layer, proof, twin,
identity, vision) but the demos were swarm-built separately and risk visual/nav drift. A coherent
shell makes the partnership look first-class — directly supporting Track G.

## Context
- Pages under [pages/ibm/](pages/ibm/). Memories: the suite spans galaxy/oracle/trust-layer/proof/twin/identity/vision; canonical helpers noted per-feature (e.g. `api/_lib/watsonx-forecast.js`); keep IBM affiliation language accurate (platform on watsonx.ai; community-built MCP).
- Track B tokens (an IBM theme layer on top of canonical tokens per B02).

## Scope
- A shared `/ibm` shell: consistent header with cross-links between all seven demos, a common intro, unified card/section styling (canonical tokens + an IBM theme layer).
- A landing index that explains the suite and routes to each demo with a one-line value.
- Verify affiliation/trademark language stays accurate (reuse the co-marketing guardrails).
- Don't break the underlying demos' functionality.

## Definition of done
- All seven IBM demos share a consistent shell and let users navigate between them; the index explains the suite; affiliation language is accurate.

## Verify
- Navigate across all seven demos via the shared nav; confirm consistent chrome and that each demo still works.
