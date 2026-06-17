---
status: not-started
---
# Prompt 7: Creator Dashboard UI

**Status:** Not Started

## Objective
Create a new "Creator Dashboard" page where users can see a list of the skills they have created.

## Explanation
To enable creators to manage their skills (e.g., set prices), they first need a dedicated space to view their creations. This task involves creating a new HTML page and the associated JavaScript to fetch and display the skills created by the currently logged-in user.

## Instructions
1.  **Create a new HTML file: `public/creator-dashboard.html`.**
2.  **Add basic HTML structure, including a header and a main content area with an empty container for the skill list, like `<div id="my-skills-list"></div>`.**
3.  **Create a new JavaScript file: `src/creator-dashboard.js`.**
4.  **In the script, add a function to fetch skills from a new API endpoint (e.g., `/api/users/me/skills`).**
5.  **On page load, call this function and render the returned skills into the `#my-skills-list` container.**
    - For each skill, display its name, description, and a placeholder for future actions (like a "Set Price" button).

## Code Example (Frontend - `src/creator-dashboard.js`)
```javascript
document.addEventListener('DOMContentLoaded', () => {
    fetchMySkills();
});

async function fetchMySkills() {
    try {
        const response = await fetch('/api/users/me/skills'); // Assumes this API exists
        if (!response.ok) throw new Error('Failed to fetch skills.');
        
        const skills = await response.json();
        renderSkills(skills);
    } catch (error) {
        console.error(error);
        document.getElementById('my-skills-list').innerHTML = `<p>Error loading your skills.</p>`;
    }
}

function renderSkills(skills) {
    const container = document.getElementById('my-skills-list');
    if (!skills.length) {
        container.innerHTML = `<p>You haven't created any skills yet.</p>`;
        return;
    }

    container.innerHTML = skills.map(skill => `
        <div class="skill-card">
            <h3>${skill.name}</h3>
            <p>${skill.description}</p>
            <div class="skill-actions">
                <button data-skill-id="${skill.id}" class="set-price-btn">Set Price</button>
            </div>
        </div>
    `).join('');
}
```
*Note: This requires a new backend endpoint `GET /api/users/me/skills` which should be created as part of this task.*

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/07-frontend-ui-creator-dashboard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
