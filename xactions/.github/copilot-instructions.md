# XActions

> ⚡ The Complete X/Twitter Automation Toolkit — Scrapers, MCP server for AI agents (Claude/GPT), CLI, browser scripts. No API fees. Open source. By nichxbt.

### Architecture Overview

XActions has **three runtime contexts** — know which one you're working in:

| Context | Where it runs | Entry point | Key constraint |
|---|---|---|---|
| **Browser scripts** | DevTools console on x.com | IIFE, paste in console | No Node.js APIs, uses DOM & `sessionStorage` |
| **Node.js library/CLI/MCP** | Local machine or server | `src/cli/index.js`, `src/mcp/server.js` | Uses Puppeteer for browser automation |
| **API server** | Express.js backend | `api/server.js` | PostgreSQL via Prisma, Redis for job queue |

### Tech Stack

- **Runtime**: Node.js >= 18, ESM (`"type": "module"` — use `import`/`export`, never `require`)
- **Backend**: Express.js with Helmet, CORS, rate limiting, Morgan logging
- **Database**: PostgreSQL via Prisma ORM (`prisma/schema.prisma`)
- **Job Queue**: Bull + Redis
- **Browser Automation**: Puppeteer + puppeteer-extra-plugin-stealth
- **Testing**: Vitest 4.x (`vitest run` to test, `vitest` for watch mode)
- **MCP**: `@modelcontextprotocol/sdk` — server at `src/mcp/server.js`

### Project Structure

```
src/                → Core library (60+ browser scripts + subdirectories)
  ├── cli/          → CLI commands (commander.js)
  ├── mcp/          → MCP server for AI agents
  ├── scrapers/     → Puppeteer-based scrapers (twitter/, bluesky/, mastodon/, threads/)
  ├── client/       → HTTP-only Twitter client (no Puppeteer needed)
  ├── automation/   → Browser automation scripts (require core.js pasted first)
  ├── agents/       → Thought leader agent, persona engine
  ├── a2a/          → Agent-to-Agent protocol
  └── utils/        → Shared utilities
api/                → Express.js backend (routes/, services/, middleware/, realtime/)
dashboard/          → Static HTML frontend
skills/             → 32 Agent Skills (skills/*/SKILL.md) — read before implementing
tests/              → Vitest tests (agents/, client/, http-scraper/, a2a/)
types/              → TypeScript declarations (index.d.ts)
prisma/             → Database schema + migrations
docs/agents/        → selectors.md, browser-script-patterns.md, contributing-features.md
```

### Skills System

32 skills in `skills/*/SKILL.md`. **Read the relevant SKILL.md before implementing** when a user's request matches a category (unfollow, scraping, analytics, content posting, growth automation, etc.).

### Commands

```bash
npm run dev              # Start API server with nodemon
npm run test             # Run all Vitest tests once
npm run cli              # Run CLI
npm run mcp              # Start MCP server
npm run agent            # Run thought leader agent
npx prisma migrate dev   # Run database migrations
```

### Patterns & Style

- `const` over `let`, async/await, ESM imports only
- Emojis in `console.log`: ❌ error, ⚠️ warning, ✅ success, 🔄 progress
- Author credit: `// by nichxbt`
- Prefer `data-testid` selectors — most stable across X/Twitter UI updates
- X enforces aggressive rate limits; all automation must include 1-3s delays
- Browser script patterns: `docs/agents/browser-script-patterns.md`
- DOM selectors reference: `docs/agents/selectors.md`

### Environment Variables

Copy `.env.example` for the full list. Key variables: `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `REDIS_PORT`, `XACTIONS_SESSION_COOKIE`, `PUPPETEER_HEADLESS`.

### Testing Conventions

- Test framework: Vitest 4.x, config in `vitest.config.js`
- Tests in `tests/` mirroring source structure, files: `*.test.js`
- **No mocks, stubs, or fakes** — real implementations only
- Timeouts: 30s per test, 30s for hooks

### Database Schema

Key Prisma models in `prisma/schema.prisma`:
- `User` — auth (Twitter OAuth + session cookies), credits, admin flags
- `Subscription` — Stripe billing tiers (free/basic/pro/enterprise)
- `Operation` — tracks automation jobs (type, status, progress, result)
- `AccountSnapshot` / `FollowerSnapshot` / `FollowerChange` — follower monitoring

### Codespace Performance

If Codespace becomes slow, check and kill resource-heavy processes:

```bash
ps aux --sort=-%cpu | head -20
pkill -f "vitest"
pkill -f "tsgo --noEmit"
```

Common resource hogs: `tsgo --noEmit` (~500% CPU), vitest workers (15x ~100% CPU each), multiple tsserver instances

### Terminal Management

- **Always use background terminals** (`isBackground: true`) for every command so a terminal ID is returned
- **Always kill the terminal** after the command completes, whether it succeeds or fails — never leave terminals open
- Do not reuse foreground shell sessions — stale sessions block future terminal operations in Codespaces
- In GitHub Codespaces, agent-spawned terminals may be hidden — they still work. Do not assume a terminal is broken if you cannot see it
- If a terminal appears unresponsive, kill it and create a new one rather than retrying in the same terminal

### Mandatory Rules

1. **Never mock, stub, or fake anything.** Real implementations only.
2. **TypeScript strict mode** — no `any`, no `@ts-ignore`.
3. **Always kill terminals** after commands complete.
4. **Always commit and push** as `nirholas`.
