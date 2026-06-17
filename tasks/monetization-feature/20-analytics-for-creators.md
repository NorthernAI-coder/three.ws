---
status: not-started
---

# Prompt 20: Analytics for Creators

**Status:** Not Started

## Objective
Provide creators with analytics on their skill sales, such as page views, conversion rates, and top referrers.

## Explanation
Data helps creators make better decisions. We can provide them with simple analytics to understand how their agent is performing in the marketplace.

## Instructions
- [ ] **Track Events:**
    - Create a new table `analytics_events`.
    - Log key events: `agent_page_view`, `skill_purchase`, `referral_link_click`.
    - Include details like `agent_id`, `user_id`, and other relevant metadata.
- [ ] **Create a new API endpoint, e.g., `GET /api/dashboard/analytics`**.
    - This endpoint will query the `analytics_events` table and aggregate the data.
    - Calculate metrics like:
        - Total views in the last 30 days.
        - Number of sales.
        - Conversion rate (sales / views).
        - Top-performing skills.
- [ ] **Create a new "Analytics" tab in the creator dashboard.**
- [ ] **Display the analytics using simple charts and cards.**
    - A line chart for views over time.
    - A bar chart for sales per skill.
    - A summary card for conversion rate.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/20-analytics-for-creators.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
