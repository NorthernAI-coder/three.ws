---
status: not-started
---

# Prompt 15: Caching Skill Prices

## Objective
Implement a caching layer to reduce database load and improve the performance of fetching skill prices.

## Explanation
Skill prices are unlikely to change frequently. Caching this data will improve the responsiveness of the marketplace and reduce the number of queries to the database.

## Instructions
1.  **Choose a Caching Strategy:**
    *   Decide on a caching solution, such as Redis or an in-memory cache.

2.  **Implement Caching Logic:**
    *   When fetching agent details, first check the cache for the skill prices.
    *   If the prices are in the cache, return them directly.
    *   If not, fetch them from the database and store them in the cache with an expiration time (e.g., 1 hour).

3.  **Cache Invalidation:**
    *   When a creator updates their skill prices, invalidate the corresponding cache entry to ensure the new prices are displayed.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/15-caching-skill-prices.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
