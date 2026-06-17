---
status: not-started
---

# Prompt 25: Legal and Tax Compliance Features

**Status:** Not Started

## Objective
Integrate basic tools to help creators with tax compliance, such as generating end-of-year earnings reports.

## Explanation
As a platform facilitating payments, we have a responsibility to make it easier for our creators to handle their finances and legal obligations.

## Instructions
- [ ] **In the Creator Earnings Dashboard, add a feature to export transaction history.**
    - Allow exporting as a CSV file.
    - The CSV should include date, skill name, amount, currency, and transaction signature for each sale.
- [ ] **Allow creators to add their legal information.**
    - Create a form in the dashboard for creators to enter their legal name, address, and tax ID (optional, and should be encrypted).
- [ ] **Generate simple annual earnings summaries.**
    - Create an API endpoint that, for a given year, calculates the total income for a creator.
- [ ] **Display clear disclaimers.**
    - Include text on the earnings page reminding creators that they are responsible for their own taxes and should consult a professional.

**Note:** We are not a financial services company, so we should not offer tax advice. The goal is to provide tools that make the data more accessible for creators.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/25-legal-and-tax-compliance.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
