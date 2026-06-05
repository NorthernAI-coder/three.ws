# B02 — Delete the competing/dead token systems

**Track:** UI Uniformity · **Size:** M · **Priority:** P0 · **Depends on:** B01

## Goal
Remove or migrate the 7 redundant CSS token systems so only the B01 canonical set remains.

## Why it matters
Eight design languages on one site is the root cause of the inconsistency. Each dead system is
also dead weight shipped to users.

## Context (systems found in the audit)
- Migrate-then-delete: `--mk-*` ([public/marketplace.css](public/marketplace.css)), `--pd-*` ([public/pump-dashboard.css](public/pump-dashboard.css)), `--t-*` (`public/theme.css`), `--sdk-*` ([public/avatar-sdk.css](public/avatar-sdk.css)).
- Likely pure-dead, verify then delete: `--ibm-*` ([public/ibm.css](public/ibm.css)), `--gx-*` ([public/galaxy.css](public/galaxy.css)), `--ho-*` (`public/home-overhaul.css`), `--saas-*` (`public/home-saas.css`).

## Scope
- For each system: grep for actual usage. If a page uses it, map its tokens to the canonical B01 tokens and update the page's CSS to consume the canonical names. If unused, delete the file and remove its `<link>`/import references.
- Preserve intentional *aesthetic* differences (e.g. the IBM galaxy's distinct look) by expressing them as a **theme layer on top of** the canonical tokens, not a parallel system.
- Remove the now-dead `<link rel="stylesheet">` tags from the HTML pages.

## Definition of done
- `grep -rEn "\-\-(mk|pd|t|sdk|ibm|gx|ho|saas)-" public pages src` returns nothing (or only inside a documented theme file that itself maps to canonical tokens).
- No page links a deleted CSS file. Visual output unchanged or improved.

## Verify
- Load marketplace, pump-dashboard, avatar-sdk, and an IBM page in dev — each still looks right, now on canonical tokens.
