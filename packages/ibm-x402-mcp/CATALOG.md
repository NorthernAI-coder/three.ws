# IBM Cloud / watsonx Orchestrate catalog listing

A ready-to-paste template for listing this server in the IBM Cloud / watsonx Orchestrate
MCP catalog. Replace the operator-specific fields (application name/id, support contacts,
and — if you publish a hosted HTTP endpoint — the endpoint URL) with your own values.
Keep the tool names, prices, and descriptions in sync with `server.json`, `README.md`,
and the tool sources in `src/tools/`.

| Field | Value |
|---|---|
| Name | `ibm-x402-mcp` |
| Display name | `IBM Granite via x402 — Pay-per-Use AI over MCP` |
| Short description (tagline) | `Pay-per-call IBM Granite AI over MCP. x402 agentic payments let any AI agent call Granite chat, code, embeddings, document analysis, and time-series forecasting — settled per call in USDC on Solana, no IBM Cloud account required.` |
| Summary | `x402 pay-per-use IBM Granite AI — chat, code, embeddings, document analysis, and time-series forecasting. Pay USDC on Solana per call. No IBM Cloud account required.` |
| Version | `1.1.0` |
| Change log | `See repository releases` |
| Domain tags (max 3) | Software development · Data & analytics · Productivity |
| Language support | English (Granite 3 models also process German, Spanish, French, Portuguese, Japanese, Korean, Italian, Dutch, Chinese, Arabic, Czech) |
| Application ID | `ibm-x402-mcp` (operator-defined) |
| Application Name | your organization (operator-defined) |
| Application icon | a square SVG/PNG you supply (<200kb) |
| Transport | stdio (`npx @three-ws/ibm-x402-mcp`) · Streamable HTTP (remote) if you self-host one |
| Server end-point URL | your hosted Streamable HTTP endpoint, if you publish one (see note below) |

## Related links

- npm: https://www.npmjs.com/package/@three-ws/ibm-x402-mcp
- Source: https://github.com/nirholas/ibm-x402-mcp
- MCP registry name: `io.github.nirholas/ibm-x402-mcp`
- Issues / support: https://github.com/nirholas/ibm-x402-mcp/issues
- x402 protocol: https://x402.org

## Description

This MCP server turns IBM Granite foundation models into pay-per-use tools any AI agent or MCP client (Claude Desktop, Claude Code, Cursor, watsonx Orchestrate) can call. Every call is settled in USDC on Solana via the open x402 payment protocol — end users need no IBM Cloud account and no subscription. The server operator supplies IBM watsonx.ai credentials and a receiving wallet; callers pay only for what they use. When a tool is called without payment, the server returns an x402 PaymentRequired envelope quoting the exact USDC price; x402-capable clients pay and retry automatically.

Six tools — one free entry point plus five independently-priced inference tools:

0. **ibm_granite_getting_started — Free, no payment or account.** Start here. Returns a machine-readable overview of the server: every tool with its per-call USDC price, the step-by-step x402 payment flow, setup requirements, and runnable example calls. Optional `section` parameter (overview, pricing, payment, tools, setup) focuses the response. Lets any client — including non-x402 hosts like watsonx Orchestrate — discover the server before paying.

1. **ibm_granite_chat — Conversational AI ($0.02/call).** General-purpose chat completion powered by IBM Granite 3 8B Instruct. Send a conversation as an ordered array of role/content messages (system, user, assistant) and receive the assistant reply plus token usage. Parameters: messages (1–50), optional model override, max_new_tokens (1–4096, default 1024), temperature (0–2, default 0.7). Use for Q&A, drafting, reasoning, and instruction following.

2. **ibm_granite_code — Code generation & review ($0.025/call).** Six code tasks via Granite instruct models: generate (new code from a description), review (bugs/security/improvements with severity-ranked findings), refactor (clarity/performance/best practices), explain (plain-language walkthrough), test (unit tests), and document (inline docs/docstrings). Parameters: task (enum), prompt (description or pasted code), optional language hint, optional context. Returns the produced code or review with a brief rationale.

3. **ibm_granite_embed — Text embeddings ($0.005/call).** Batch-embeds 1–64 texts (up to 8,000 chars each) using ibm/granite-embedding-278m-multilingual, returning one dense float vector per input. Parameters: inputs (array), optional model override. Use for semantic search, RAG retrieval, clustering, deduplication, and cross-language similarity scoring.

4. **ibm_granite_analyze — Structured document analysis ($0.04/call).** Extracts a machine-readable JSON analysis from any text — entities, sentiment (label + score), key findings, severity-tagged risk flags, a 3-sentence summary, and 3 actionable next steps. Parameters: document (up to 24,000 chars), analysis_type (general, contract, financial, technical, medical, sentiment), optional language hint. Tailors extraction per type (e.g. contract → parties, obligations, termination/penalty clauses; financial → metrics, red flags, forward-looking statements).

5. **ibm_granite_forecast — Time-series forecasting ($0.05/call).** Zero-shot numeric forecasting via IBM Granite TTM (Tiny Time Mixer) — no training required. Provide 64–1024 ISO-8601 timestamps and aligned numeric values at a uniform cadence; receive a forecast horizon as timestamped points. Parameters: timestamps, values (equal length), freq (pandas-style, e.g. 1h/1D/1W), optional prediction_length (1–96), optional label. Use for revenue, traffic, demand, sensor, energy, and financial series.

Models: IBM Granite 3 8B Instruct (chat/code/analyze), IBM Granite Embedding 278M Multilingual (embed), and IBM Granite TTM (forecast) — all served by IBM watsonx.ai, region-configurable (us-south default; eu-de, eu-gb, jp-tok, au-syd, ca-tor). Open source (Apache-2.0). Independent project integrating IBM Granite via watsonx.ai; not an IBM product. Granite, watsonx, and watsonx.ai are trademarks of IBM.

## Pricing tab

Billing is **out-of-band**: every tool call settles in USDC on Solana via the x402 protocol. IBM Cloud is not the billing channel — end users need no IBM Cloud account and no subscription. The catalog listing itself is therefore **Free to add**; the per-call USDC prices are disclosed in the Description.

| Field | Value |
|---|---|
| Pricing model | `Free` (open-source MCP server; per-call cost settled off-platform via x402) |

If the Partner Center "Add starting price" flow requires a starting-price row (Paid model), use the cheapest tool's per-call floor so the advertised "starting at" figure is honest:

| Field | Value | Notes |
|---|---|---|
| Country | `United States` | Base price row; add other countries as needed |
| Currency | `USD` | x402 settles in USDC; USD is the display peg |
| Quantity Tier | `1` | Tier starts at 1 unit (1 API call) |
| Price | `0.005` | Lowest per-call price (`ibm_granite_embed`) — "starting at $0.005/call" |
| Unit / metric | `per API call` | If the metric field is present |

Per-call prices (source of truth — keep in sync with Description and `src/tools/`): `ibm_granite_embed` $0.005 · `ibm_granite_chat` $0.02 · `ibm_granite_code` $0.025 · `ibm_granite_analyze` $0.04 · `ibm_granite_forecast` $0.05.

## Support tab

| Field | Value |
|---|---|
| Support provider | `Third party` (the operator/maintainer publishing the listing) |
| Statement of support | See below — keep in sync with `SUPPORT.md` |
| Support languages | English |

**Statement of support** (adapt the contact links to your deployment, then paste verbatim):

> x402 MCP for IBM Granite is an independent, open-source product. It integrates IBM Granite via watsonx.ai but is not an IBM product and is not supported by IBM.
>
> Where to get help:
> • GitHub Issues — bugs, crashes, unexpected tool output, feature requests: https://github.com/nirholas/ibm-x402-mcp/issues
> • GitHub Discussions — setup and integration "how do I…" questions: https://github.com/nirholas/ibm-x402-mcp/discussions
> • Security — report vulnerabilities privately via a GitHub security advisory; please do not open a public issue: https://github.com/nirholas/ibm-x402-mcp/security
>
> What we support:
> • Installing, configuring, and running the MCP server.
> • The five ibm_granite_* tools (chat, code, embed, analyze, forecast) and their x402 USDC-on-Solana payment flow.
> • Integration with MCP clients (Claude Desktop, Claude Code, Cursor, and custom agents).
>
> Out of scope — handled by IBM Cloud Support (https://cloud.ibm.com/unifieddeliveryportal): IBM watsonx.ai platform issues, Granite model behavior, and IBM billing. We will help you tell a server problem from an IBM-platform problem.
>
> Response is best-effort, typically within a few business days; security reports are prioritized. Support is provided in English. Please redact all secrets (API keys, private keys, wallet seeds) from any report — a truncated public Solana address is fine.
>
> Granite, watsonx, and watsonx.ai are trademarks of IBM.

## Note on transports and the endpoint URL

The five Granite tools ship over stdio out of the box, and can also be exposed over a Streamable HTTP endpoint if you self-host one:

- **stdio** — the `@three-ws/ibm-x402-mcp` npm package (`npx @three-ws/ibm-x402-mcp`), for local MCP hosts (Claude Desktop, Claude Code, Cursor). Payment: per-call USDC on Solana via the x402 envelope. This is all most catalog listings need.
- **Streamable HTTP (remote)** — the watsonx Orchestrate catalog requires a remote endpoint URL. If you run a hosted deployment, wrap this server's tool suite behind your own MCP 2025-06-18 HTTP endpoint and list that URL here. Keep tool schemas, prices, and output shapes identical to the npm package.

Because watsonx Orchestrate is not x402-capable, a hosted endpoint typically runs dual-mode:

- **Anonymous callers pay per call** in USDC. An unpaid `tools/call` returns a 402 quoting the exact per-tool price (chat $0.02, code $0.025, embed $0.005, analyze $0.04, forecast $0.05); x402-capable clients pay and retry automatically. Settlement runs after the tool succeeds.
- **Authenticated principals (Bearer / OAuth) call without per-call payment** — the operator-funded path. A watsonx Orchestrate connection supplies a Bearer credential, so the tools are effectively included-in-connection rather than billed per USDC call.

The operator funds inference by setting `WATSONX_API_KEY` + `WATSONX_PROJECT_ID` (and the `MCP_SVM_PAYMENT_ADDRESS` receiving wallet) in the deployment environment; end users still need no IBM Cloud account.
