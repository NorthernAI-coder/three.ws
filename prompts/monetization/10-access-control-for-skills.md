---
status: not-started
---

# Prompt 10: Access Control for Paid Skills

## Objective
Implement a system to ensure that only users who have purchased a skill can use it.

## Explanation
This is a critical part of the monetization feature. The system needs to check for ownership before allowing the execution of a paid skill. This can be done at the API gateway or within the agent's core logic.

## Instructions
1.  **Create a Middleware:**
    *   Implement a middleware that sits in front of the skill execution endpoint.
    *   The middleware should extract the user's ID, the agent ID, and the skill name from the request.

2.  **Check for Ownership:**
    *   In the middleware, query the `user_skill_purchases` table to see if a record exists for the user, agent, and skill.
    *   Also, check if the skill is free by looking at the `agent_skill_prices` table.
    *   If the skill is free or if the user owns it, allow the request to proceed.
    *   If the skill is paid and the user does not own it, return a `403 Forbidden` or `402 Payment Required` error.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/10-access-control-for-skills.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
