# Task: Verify the demo route reorg + write `docs/demo-routes.md`

## Repo context

Working tree: `/workspaces/three.ws`. A recent refactor (commit
`2071392c refactor(routes): use canonical clean URLs across JS, pages, and api
redirects`) moved demo routes around:

- `/coin` → `/demo/coin` (legacy URL should redirect, not 404)
- `/demo/avatar-os/*` added
- `/demos/*` added (plural index of demos)

Routes are wired in two places:

- `vercel.json` — production redirects/rewrites.
- `vite.config.js` — dev-server entry points and aliases.

## Rails (CLAUDE.md — non-negotiable)

- No mocks. The verification must hit the **real** dev server and the
  **real** redirects, not a simulated router.
- No fake data — read actual responses from `curl` and inspect them.
- Done = every route returns a 200 (or the documented redirect to a
  200), the new doc exists, `git diff` reviewed.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — list every route to test

Read `vercel.json` and `vite.config.js`. Enumerate:

- Every entry under `/demo/*`.
- Every entry under `/demos/*`.
- Every redirect whose source contains `coin` (to verify the legacy
  `/coin` → `/demo/coin` mapping).
- Every page file under `pages/` whose name starts with `demo-` or
  contains `coin`.

Build a single markdown table with columns: `route`, `expected status`,
`expected final URL` (after redirects).

### Step 2 — start the dev server

```bash
npm run dev
```

Wait for it to come up (the build banner prints the port — typically
`http://localhost:3000`). Run subsequent curl commands in another shell
or with `&`.

### Step 3 — curl each route

For each row in the table:

```bash
curl -sIL -o /dev/null -w "%{http_code} %{url_effective}\n" http://localhost:3000<route>
```

`-L` follows redirects. `%{http_code}` is the final status.
`%{url_effective}` is the final URL after any 30x bounces.

Fill in the actual values in the table.

### Step 4 — for each 200, inspect the rendered HTML

```bash
curl -sL http://localhost:3000<route> | grep -i -E "<title>|error|404"
```

Confirm:

- A `<title>` exists and is not the generic Vite placeholder.
- No "error" or "404" text in the rendered HTML.
- The page loads its JS bundle (look for a `<script type="module"
  src=`).

If any of these fail, **fix the underlying route**:

- If `vercel.json` is missing a rewrite, add it. Match the convention
  of the entries already there.
- If `vite.config.js` is missing an entry under `build.rollupOptions.
  input`, add it. Match the convention.
- Then re-curl until the row passes.

### Step 5 — verify in a real browser

```bash
# server already running
```

For each route, open `http://localhost:3000<route>` in a browser.
Confirm:

- No console errors in devtools.
- Network tab shows the expected HTML + JS + GLB / asset fetches all
  succeeding.

The user can see things curl can't — do this step honestly.

### Step 6 — write `docs/demo-routes.md`

Structure:

```markdown
# Demo routes

The canonical map of every `/demo/*` and `/demos/*` route as of
<today's date>. Update whenever a route is added, removed, or moved.

## Routes

| Route | Page file | What it does |
|---|---|---|
| `/demo/coin` | `pages/pump-coin-page.html` | ... |
| ... | | |

## Legacy redirects

| Old | New | Configured in |
|---|---|---|
| `/coin` | `/demo/coin` | `vercel.json` |
| ... | | |

## Adding a new demo

1. Create the page under `pages/demo-foo.html`.
2. Add to `vite.config.js` under `build.rollupOptions.input`.
3. Add to `vercel.json` rewrites if the URL is not the file name.
4. Add a row to the table above.
5. Curl-verify the route returns 200.
```

Fill in every row from the verified table.

### Step 7 — kill the dev server

```bash
# Ctrl-C / kill the background pid
```

## Definition of done

- Every route in the table returns the expected status (200 or
  documented 30x).
- Every legacy redirect lands on a 200.
- `docs/demo-routes.md` exists and reflects the live state.
- `git diff` shows only intentional changes (the new doc, and any
  route fixes in `vercel.json` / `vite.config.js`).

## Constraints

- Do not change page content. Only fix routing (`vercel.json`,
  `vite.config.js`) when a route is broken.
- If a page file is missing entirely for a route the config tries to
  serve, do not invent the page. Report and stop — the user may have
  removed it intentionally.
- Do not generate the route table by reading config alone. Verify
  every row with a real curl. Config can lie; HTTP cannot.
