---
status: not-started
---

# Prompt 5: UI for "Purchase Skill" Button

## Objective
Add a "Purchase Skill" button to the agent detail page for skills that are not free.

## Explanation
To allow users to buy skills, a clear call-to-action is needed. This button will be displayed next to paid skills that the user has not yet purchased, and it will trigger the payment flow.

## Instructions
1.  **Modify the Frontend UI:**
    *   In `src/marketplace.js`, in the `renderDetail` function, update the skill rendering logic.
    *   For each skill, check if it's paid and if the current user has already purchased it.
    *   If the skill is paid and not purchased, display a "Purchase" or "Unlock" button instead of the price badge.
    *   If the skill is free or already purchased, display the "Free" or "Owned" badge.

2.  **Button State:**
    *   The button should be clearly visible and clickable.
    *   Add a `data-skill-name` attribute to the button to identify which skill is being purchased.

## Code Example (Frontend - `src/marketplace.js`)

```javascript
// Inside renderDetail function, an updated version of the skill rendering logic
const skillPrices = a.skill_prices || {};
const ownedSkills = user.owned_skills || []; // Assuming this data is available

$('d-skills').innerHTML = skillsArr.map((s) => {
    const name = typeof s === 'string' ? s : (s.name || '');
    const price = skillPrices[name];
    
    let badge;
    if (price) {
        if (ownedSkills.includes(name)) {
            badge = `<span class="price-badge price-owned">Owned</span>`;
        } else {
            badge = `<button class="purchase-btn" data-skill-name="${name}">Purchase</button>`;
        }
    } else {
        badge = `<span class="price-badge price-free">Free</span>`;
    }
    
    return `<span class="skill-entry">${escapeHtml(name)}${badge}</span>`;
}).join(' ');
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/monetization/05-ui-purchase-skill-button.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
