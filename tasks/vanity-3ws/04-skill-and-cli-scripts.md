# Task 04 — The `create-coin` skill + CLI scripts stamp the `3ws` mark

## Goal

Coins launched outside the web UI — via the pump-fun `create-coin` skill and the repo's
launch scripts — must also carry the mark. A skill-driven or CLI launch is still a
three.ws launch.

## Surfaces

1. **`pump-fun-skills/create-coin/`** (`handlers.js`, `scripts/`, `SKILL.md`, `tools.json`)
   - Find where the mint keypair is created (a `Keypair.generate()` or equivalent).
   - Replace with a server/Node grind of the mark: `import { grindVanityNode } from '<rel>/src/solana/vanity/grinder-node.js'` and `import { THREE_WS_VANITY } from '<rel>/src/solana/vanity/brand.js'`, then `Keypair.fromSecretKey((await grindVanityNode({ ...THREE_WS_VANITY })).secretKey)`.
   - If the skill is a self-contained package that can't import from `src/`, inline a minimal grinder **but** keep the mark string sourced from a single local constant mirroring `brand.js` (and note the mirror in a comment) — never hardcode `'3ws'` in multiple spots within the package.
   - Update `SKILL.md`: document that every coin created through it is stamped `3ws…` and why (brand provenance). Keep all examples/fixtures on `$THREE` / `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` (`CLAUDE.md`).

2. **`scripts/coin-cli.mjs`** — two `Keypair.generate()` sites for the mint (≈ line 130 helper, ≈ line 240 in the launch path):
   - The launch-path mint (line ~240, the `else` branch when no `--mint-keypair` is passed) must grind the mark instead of `Keypair.generate()`.
   - Preserve the `--mint-keypair <file>` escape hatch for power users, **but** validate the loaded keypair carries the mark with `hasThreeWsMark(mint.publicKey.toBase58())` and refuse (clear stderr message + non-zero exit) if it doesn't, unless `--no-mark` is explicitly passed. `--no-mark` exists only for genuinely coin-agnostic plumbing, mirroring the server kill-switch.
   - The line ~130 helper: inspect what it mints; if it's a throwaway/non-coin keypair leave it, if it's a coin mint, mark it.

3. **`scripts/direct-pump-launch.mjs`** — same treatment: grind the mark for the launched mint; print the marked address in the success summary.

4. **`scripts/pump-launch-usdc.mjs`** and **`scripts/pumpfun-lifecycle-smoke.js`** — if they launch a coin, mark the mint. The smoke test should additionally **assert** the resulting mint matches `/^3ws/i` so the brand is regression-guarded end-to-end.

## Constraints

- These are scripts → they live in `scripts/` (repo hygiene). Do not add new throwaway files
  in the root.
- `grindVanityNode` on a 3-char case-insensitive prefix is sub-second; no need for the
  worker-thread `grind-vanity.mjs` pool here, but you may use it if a script already imports it.
- Keep the `--mint-keypair` / `--no-mark` escape hatches honest: they exist for arbitrary-mint
  plumbing only, and the default is always marked.
- No coin but `$THREE` in any script output, comment, fixture, or doc.

## Success criteria

- `node scripts/coin-cli.mjs launch …` (no `--mint-keypair`) prints a `3ws…` mint.
- Passing `--mint-keypair` to a non-`3ws` key is rejected unless `--no-mark`.
- `node scripts/direct-pump-launch.mjs …` yields a `3ws…` mint in its summary.
- `pumpfun-lifecycle-smoke.js` asserts the mark and passes on devnet.
- The `create-coin` skill, run end-to-end, produces a `3ws…` mint and its `SKILL.md`
  documents the behavior.

## Verification

```bash
# dry inspect the grind without launching
node -e "import('./src/solana/vanity/grinder-node.js').then(async m=>{
  const b=await import('./src/solana/vanity/brand.js');
  const g=await m.grindVanityNode({...b.THREE_WS_VANITY});
  console.log(g.publicKey, /^3ws/i.test(g.publicKey), g.attempts+' attempts', g.durationMs+'ms');
})"
```
