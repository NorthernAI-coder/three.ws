---
status: not-started
---

# Prompt 4: Database Schema for Skill Prices

## Objective
Design and implement the necessary database schema to store the prices of agent skills.

## Explanation
A new table, `agent_skill_prices`, is needed to store the monetization information for each skill. This table will link an agent, a skill, and its price.

## Instructions
1.  **Design the Table:**
    *   Create a new table named `agent_skill_prices`.
    *   The table should have the following columns:
        *   `id`: Primary key.
        *   `agent_id`: Foreign key referencing the `agents` table.
        *   `skill_name`: The name of the skill being priced.
        *   `amount`: The price of the skill in the smallest currency unit (e.g., lamports).
        *   `currency_mint`: The mint address of the currency (e.g., the USDC mint on Solana).
        *   `created_at`, `updated_at`: Timestamps.

2.  **Create a Migration:**
    *   Use your database migration tool to create a new migration file.
    *   Write the SQL script to create the `agent_skill_prices` table.
    *   Apply the migration to your database.

## SQL Example

```sql
CREATE TABLE agent_skill_prices (
    id SERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id),
    skill_name VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL,
    currency_mint VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, skill_name)
);
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/04-db-schema-skill-prices.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
