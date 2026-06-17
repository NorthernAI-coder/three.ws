#!/usr/bin/env node
// Combine ONLY the AI + crypto/blockchain product docs into a single curated file
// (docs/AI-CRYPTO.md) for use as a NotebookLM (or any RAG) source.
//
//   node scripts/combine-docs-ai-crypto.mjs
//
// Why this exists, vs. scripts/combine-docs.mjs (which flattens ALL of docs/):
//   - Scope: keeps the AI-agent and crypto/blockchain *concepts* only. 3D-world,
//     metaverse, avatar/appearance, viewer/editor, embedding, UI/design, and
//     internal engineering-process docs (briefs, roadmaps, status logs, build
//     prompts) are intentionally left out so a notebook trained on this file talks
//     about what three.ws *is*, not how it gets built.
//   - The allowlist below is the single source of truth. To add/remove a topic,
//     edit a CATEGORIES entry — nothing here is inferred from the filesystem.
//
// Originals under docs/ are never modified. Re-run manually to refresh the snapshot.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.cwd();
const OUT = 'docs/AI-CRYPTO.md';

// Curated, thematically-grouped allowlist. Order here = order in the output.
// Every path is relative to the repo root. Only product/concept docs belong here.
const CATEGORIES = [
  {
    title: 'Platform Overview — agents with a wallet and an on-chain identity',
    files: [
      'docs/introduction.md',
      'docs/how-it-works.md',
      'docs/architecture.md',
      'docs/three-ws-feature-article.md',
      'docs/coinmarketcap-article.md',
    ],
  },
  {
    title: 'AI Agents — system, manifest & behavior',
    files: [
      'docs/agent-system.md',
      'docs/agent-manifest.md',
      'docs/agents-vs-avatars.md',
      'docs/make-your-agent.md',
      'docs/multi-agent.md',
      'docs/persona-hub.md',
      'docs/memory.md',
      'docs/skills.md',
      'docs/x-spaces.md',
    ],
  },
  {
    title: 'AI Brains, MCP & agent tooling',
    files: [
      'docs/mcp.md',
      'docs/mcp-agent.md',
      'docs/mcp-x402-bazaar.md',
      'docs/ibm.md',
      'docs/ibm-x402-mcp.md',
      'docs/aws-builder-center-mcp-agents.md',
      'docs/pump-fun-mcp-edge.md',
    ],
  },
  {
    title: 'Agent security & trust (zauth)',
    files: [
      'docs/zauth/index.md',
      'docs/zauth/provider-hub.md',
      'docs/zauth/reposcan.md',
      'docs/zauth/vector.md',
      'docs/zauth/database.md',
      'docs/authentication.md',
      'docs/permissions.md',
      'docs/security.md',
    ],
  },
  {
    title: 'On-chain identity & reputation',
    files: [
      'docs/onchain-agents.md',
      'docs/erc8004.md',
      'docs/erc8004/validation-attestation.md',
      'docs/smart-contracts.md',
      'docs/reputation.md',
      'docs/mint-mark.md',
    ],
  },
  {
    title: 'x402 — agents paying agents',
    files: [
      'docs/x402.md',
      'docs/pay-skills-listing.md',
      'docs/api/forge-x402.md',
      'docs/aws-builder-center-marketplace-x402.md',
      'docs/do-i-need-crypto.md',
    ],
  },
  {
    title: 'Solana & pump.fun',
    files: [
      'docs/solana.md',
      'docs/solana-pumpfun.md',
      'docs/pump-platform-fee.md',
    ],
  },
  {
    title: 'pump.fun program reference (protocol)',
    files: [
      'docs/pumpfun-program/README.md',
      'docs/pumpfun-program/UPSTREAM-buy-sell-v2-announcement.md',
      'docs/pumpfun-program/docs/PUMP_PROGRAM_README.md',
      'docs/pumpfun-program/docs/PUMP_SWAP_README.md',
      'docs/pumpfun-program/docs/PUMP_SWAP_SDK_README.md',
      'docs/pumpfun-program/docs/CPI_README.md',
      'docs/pumpfun-program/docs/FAQ.md',
      'docs/pumpfun-program/docs/FEE_PROGRAM_README.md',
      'docs/pumpfun-program/docs/FEE_RECIPIENTS.md',
      'docs/pumpfun-program/docs/BREAKING_FEE_RECIPIENT.md',
      'docs/pumpfun-program/docs/PUMP_CASHBACK_README.md',
      'docs/pumpfun-program/docs/PUMP_CREATOR_FEE_README.md',
      'docs/pumpfun-program/docs/PUMP_SWAP_CREATOR_FEE_README.md',
      'docs/pumpfun-program/docs/instructions/BUY.md',
      'docs/pumpfun-program/docs/instructions/SELL.md',
      'docs/pumpfun-program/docs/instructions/COIN_CREATION.md',
      'docs/pumpfun-program/docs/instructions/COLLECT_CREATOR_FEE.md',
      'docs/pumpfun-program/docs/instructions/CREATOR_FEE_SHARING.md',
      'docs/pumpfun-program/docs/instructions/CLAIM_CASHBACK.md',
    ],
  },
  {
    title: 'Use cases — AI + crypto',
    files: [
      'docs/content/use-cases/ai-agent-developer.md',
      'docs/content/use-cases/crypto-community.md',
    ],
  },
  {
    title: 'Hands-on tutorials — AI brains, skills & on-chain',
    files: [
      'docs/tutorials/connect-ai-brain.md',
      'docs/tutorials/agent-personality.md',
      'docs/tutorials/greeting-and-first-speech.md',
      'docs/tutorials/custom-skill.md',
      'docs/tutorials/skill-with-database-auth.md',
      'docs/tutorials/multi-agent-coordination.md',
      'docs/tutorials/mcp-server-for-your-agent.md',
      'docs/tutorials/mint-pumpfun-token.md',
      'docs/tutorials/paid-x402-endpoint.md',
      'docs/tutorials/register-onchain.md',
    ],
  },
];

// Unambiguous operating-rule / internal-process markers. These describe how we
// build, not what we build, and must never reach the notebook. We refuse to emit
// a file that contains one rather than silently leaking it into the source.
const FORBIDDEN = [
  /no mocks/i,
  /no fake data/i,
  /prime directive/i,
  /definition of done/i,
  /self-review protocol/i,
  /interview the user/i,
];

const missing = [];
const tainted = [];

const sections = [];
let seq = 0;
for (const cat of CATEGORIES) {
  for (const path of cat.files) {
    if (!existsSync(path)) {
      missing.push(path);
      continue;
    }
    const raw = readFileSync(path, 'utf8');
    const hit = FORBIDDEN.find((re) => re.test(raw));
    if (hit) {
      tainted.push(`${path}  (matched ${hit})`);
      continue;
    }
    seq += 1;
    sections.push({
      path,
      category: cat.title,
      anchor: `sec-${String(seq).padStart(3, '0')}`,
      body: raw.replace(/\s+$/, ''),
    });
  }
}

if (missing.length) {
  console.error('Allowlisted docs not found — fix the path in CATEGORIES:');
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
if (tainted.length) {
  console.error('Allowlisted docs contain operating-rule language (excluded — move the rule out of the doc, or drop the doc):');
  for (const t of tainted) console.error(`  - ${t}`);
  process.exit(1);
}

// Thematic table of contents.
const tocLines = [];
for (const cat of CATEGORIES) {
  const inCat = sections.filter((s) => s.category === cat.title);
  if (!inCat.length) continue;
  tocLines.push(`\n### ${cat.title}\n`);
  for (const s of inCat) tocLines.push(`- [${s.path.replace(/^docs\//, '')}](#${s.anchor})`);
}

const totalBytes = sections.reduce((n, s) => n + Buffer.byteLength(s.body), 0);
const stamp = new Date().toISOString().slice(0, 10);

const header = `<!-- GENERATED by scripts/combine-docs-ai-crypto.mjs — do not edit by hand. Edit the source files under docs/ and re-run. -->
# three.ws — AI & On-Chain Knowledge Base

> A curated single-file source covering only the **AI-agent** and **crypto / blockchain** concepts behind three.ws — built for use as a NotebookLM (or other RAG) source. Generated ${stamp} from **${sections.length} documents** (~${Math.round(totalBytes / 1024)} KB).
>
> **Scope, on purpose.** This file is about *what three.ws is and what it lets agents do*: autonomous AI agents, LLM brains, MCP tooling, skills, memory, on-chain identity (ERC-8004 / Metaplex Core), reputation, x402 agent-to-agent payments, Solana, and the pump.fun protocol. The platform's 3D-world / metaverse / avatar / viewer / embedding surfaces and all internal engineering-process material (build briefs, roadmaps, status logs, deploy runbooks, operating rules) are **intentionally excluded** so a notebook built on this source discusses the product, not how it is built.
>
> The individual source files under \`docs/\` remain the canonical, editable copies — this is a read-only aggregate.

## Table of contents
${tocLines.join('\n')}

---
`;

const bodyOut = sections
  .map(
    (s) =>
      `<a id="${s.anchor}"></a>\n\n> **Topic:** ${s.category} · **Source:** \`${s.path}\` · [↑ table of contents](#table-of-contents)\n\n${s.body}`,
  )
  .join('\n\n---\n\n');

writeFileSync(`${ROOT}/${OUT}`, `${header}\n${bodyOut}\n`);
console.log(`Wrote ${OUT}: ${sections.length} docs, ${Math.round(totalBytes / 1024)} KB combined.`);
