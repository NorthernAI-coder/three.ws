---
status: not-started
---

# Prompt 9: Database Schema for User Purchases

## Objective
Create a database table to track which users have purchased which skills.

## Explanation
This table is essential for managing skill ownership. It will provide a record of every successful purchase, allowing the application to check if a user has access to a particular paid skill.

## Instructions
1.  **Design the Table:**
    *   Create a new table named `user_skill_purchases`.
    *   The table should have the following columns:
        *   `id`: Primary key.
        *   `user_id`: Foreign key referencing the `users` table.
        *   `agent_id`: Foreign key referencing the `agents` table.
        *   `skill_name`: The name of the skill that was purchased.
        *   `transaction_signature`: The Solana transaction signature of the purchase.
        *   `created_at`: Timestamp.

2.  **Create a Migration:**
    *   Use your database migration tool to create and apply a migration for the `user_skill_purchases` table.

## SQL Example

```sql
CREATE TABLE user_skill_purchases (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    skill_name VARCHAR(255) NOT NULL,
    transaction_signature VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, agent_id, skill_name)
);
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/09-db-schema-user-purchases.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
