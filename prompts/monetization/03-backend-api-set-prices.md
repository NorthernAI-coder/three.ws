---
status: not-started
---

# Prompt 3: Backend API to Set Skill Prices

## Objective
Implement a secure backend API endpoint that allows agent creators to save and update the prices for their skills.

## Explanation
This API will receive the pricing information from the creator UI and persist it in the database. It's crucial that this endpoint is secure and only allows the agent's owner to modify the prices.

## Instructions
1.  **Create a New API Endpoint:**
    *   Create a new API endpoint, for example, `POST /api/agents/:id/skills/prices`.
    *   This endpoint should be protected and require authentication. Ensure that the authenticated user is the owner of the agent.

2.  **Implement the Logic:**
    *   The endpoint will receive a payload containing the skill prices, like ` { "skill_name": { "amount": 1000000, "currency_mint": "EPjFWdd..." } }`.
    *   Validate the input data to ensure it's in the correct format.
    *   In the database, update or insert the new prices in the `agent_skill_prices` table, associating them with the agent and the specific skills.

## Code Example (Backend - Express.js like)

```javascript
// POST /api/agents/:id/skills/prices
router.post('/:id/skills/prices', async (req, res) => {
    const { id } = req.params;
    const { prices } = req.body;
    const userId = req.session.userId;

    // 1. Authenticate and authorize the user
    const agent = await db.getAgentById(id);
    if (!agent || agent.owner_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // 2. Validate the pricing data
    if (!prices) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    // 3. Save the prices to the database
    await db.saveSkillPrices(id, prices);

    res.status(200).json({ success: true });
});
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/03-backend-api-set-prices.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
