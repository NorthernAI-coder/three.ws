# Submit these from your accounts

npm and Open VSX were token-CLI publishes, so I did those. The rest need **your**
GitHub login, a web-OAuth connect, or a business account — the token in this
environment is a scoped integration token that can't fork/PR external repos
(confirmed: `HTTP 403 Resource not accessible by integration`). Everything below
is prepped; each is one action.

---

## 1. awesome-x402 (Awesome Agentic Commerce) — 2 min

Repo: https://github.com/Merit-Systems/awesome-x402 (PRs welcome). Add this line
under the `### Ecosystem` heading in `README.md`, then open a PR:

```markdown
- [three.ws](https://three.ws) - x402 for VS Code (buyer + paid-endpoint scaffolder) on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402) and [Open VSX](https://open-vsx.org/extension/threews/vscode-x402), plus `@three-ws/x402-fetch` (zero-dependency EVM client), `@three-ws/x402-server` (turn any endpoint paid; advertises USDC + $THREE in one 402), and `@three-ws/x402-mcp` (self-custodial Solana buyer over MCP). Pays in USDC or $THREE on Solana, and USDC on Base.
```

From your own machine (logged in as you):
```bash
gh repo fork Merit-Systems/awesome-x402 --clone && cd awesome-x402
# paste the bullet under "### Ecosystem" in README.md
git checkout -b add-three-ws && git commit -am "Add three.ws to Ecosystem"
git push -u origin add-three-ws
gh pr create --repo Merit-Systems/awesome-x402 --title "Add three.ws" --body "x402 for VS Code + SDKs; pays USDC or \$THREE on Solana."
```

## 2. Coinbase x402 ecosystem — 5 min

Repo: https://github.com/coinbase/x402 (powers https://www.x402.org/ecosystem).
Each partner is a folder `typescript/site/app/ecosystem/partners-data/<slug>/metadata.json`
plus a logo at `typescript/site/public/logos/<slug>.svg`.

1. Copy [`x402-ecosystem-metadata.json`](x402-ecosystem-metadata.json) →
   `typescript/site/app/ecosystem/partners-data/three-ws/metadata.json`
2. Copy `public/three.svg` (from this repo) → `typescript/site/public/logos/three-ws.svg`
3. Fork, branch, PR:
```bash
gh repo fork coinbase/x402 --clone && cd x402
mkdir -p typescript/site/app/ecosystem/partners-data/three-ws
cp <metadata.json> typescript/site/app/ecosystem/partners-data/three-ws/metadata.json
cp <three.svg>     typescript/site/public/logos/three-ws.svg
git checkout -b add-three-ws && git add typescript/site && git commit -m "Add three.ws to ecosystem"
git push -u origin add-three-ws
gh pr create --repo coinbase/x402 --title "Add three.ws to ecosystem" --body "x402 for VS Code (Marketplace + Open VSX) + @three-ws x402 SDKs. Pays USDC or \$THREE on Solana, USDC on Base."
```
(Same pattern works for **gold-402** and **mcp.so / cursor.directory** — swap the repo + file path.)

## 3. Smithery — config done, connect is web-OAuth

`smithery.yaml` is now committed in every MCP server dir (34 of them). To list:
1. Go to https://smithery.ai → sign in with GitHub.
2. "Add Server" → connect `nirholas/three.ws` → it reads each `smithery.yaml`.
Glama and PulseMCP auto-crawl the official MCP registry, so those should index
themselves; no action needed.

## 4. JSR (jsr.io) — needs scope + browser auth

No static token like npm — publish is browser-OAuth or GitHub-Actions OIDC, and
the `@three-ws` scope must be created on jsr.io first.
1. Create the scope at https://jsr.io/new (or link your GitHub org).
2. I can add a `jsr.json` (name/version/exports) to each SDK and get
   `npx jsr publish --dry-run` green — say the word and I'll wire all the SDKs.
3. Then `cd packages/<sdk> && npx jsr publish` (opens a browser to auth).

## 5. Azure Marketplace — business-account offer (draft below)

Requires Microsoft **Partner Center** with company + tax/banking verification, so
only you can submit. Full offer draft:

- **Offer type:** Software as a Service (or "Contact me" listing to start, no metering)
- **Offer name:** three.ws — 3D AI agents that earn, pay, and coordinate
- **Search-results summary (~100 chars):** Open-source 3D AI agent platform with native x402 payments, 38 MCP servers, and SDKs.
- **Short description:** three.ws turns a prompt into a rigged 3D AI agent, gives it a wallet, and lets agents pay each other per call over the open x402 protocol (USDC or $THREE on Solana, USDC on Base). Includes a VS Code extension, 38 MCP servers, and 20+ npm SDKs.
- **Description (long):** Use the "Where x402 fits" section of `x402-article.md` — it already covers the platform, MCP suite, SDKs, and integrations (IBM Granite/watsonx.ai, AWS, Alibaba Cloud, Solana Mobile).
- **Categories:** Developer Tools; AI + Machine Learning; Blockchain
- **Plans:** Free (open-source); optional paid tier later via x402 metering.
- **Useful links:** Website https://three.ws · Docs https://three.ws/docs · Support https://three.ws/support · Privacy https://three.ws/legal · Terms https://three.ws/legal
- **Lead management:** connect Partner Center leads to your CRM/email.
- Submit at https://partner.microsoft.com → Marketplace offers → New offer → SaaS.

---

## Status recap

| Channel | State |
|---|---|
| npm (`@three-ws/*`) | ✅ published (token CLI) |
| Open VSX | ⚠️ `0.1.1` live; `0.2.x` uploaded but **inactive** — needs your dashboard action |
| awesome-x402 | 📋 bullet ready → your PR |
| coinbase/x402 ecosystem | 📋 `metadata.json` ready → your PR |
| Smithery | ✅ `smithery.yaml` in all 34 servers → your web connect |
| Glama / PulseMCP | ➖ auto-crawl the MCP registry |
| JSR | 📋 needs scope + browser auth; I can add `jsr.json` on request |
| Azure Marketplace | 📋 offer drafted → your Partner Center submit |
