# Task 01 — Enforce the `3ws` mark in `launch-prep` (user-signed launches)

## Goal

`handleLaunchPrep` in `api/pump/[action].js` must guarantee the mark on every branded
launch, two ways:

1. **No mint supplied** → the server grinds a `3ws` mint instead of `Keypair.generate()`.
2. **Client supplies `mint_address`** → the server validates it carries the mark and
   **rejects** it (400) if not.

This makes the brand a server invariant: a hand-rolled `curl` to the API cannot ship an
unbranded three.ws coin.

## Context

- File: `api/pump/[action].js`. `handleLaunchPrep` starts at the `async function handleLaunchPrep(req, res)` definition (~line 902). The mint section reads:

  ```js
  // Mint pubkey: client-supplied (vanity-ground) or freshly generated.
  let mintKeypair = null;
  let mint;
  if (body.mint_address) {
    const supplied = solanaPubkey(body.mint_address);
    if (!supplied) return error(res, 400, 'validation_error', 'invalid mint_address');
    mint = supplied;
  } else {
    mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;
  }
  ```

- `launchPrepSchema` has `coin_type: z.enum(['regular', 'mayhem', 'agent']).default('agent')` and `mint_address: z.string().min(32).max(44).optional()`.
- Server grinder: `import { grindVanityNode } from '../../src/solana/vanity/grinder-node.js'` → returns `{ publicKey, secretKey, attempts, durationMs }` (Uint8Array secret key, web3-compatible). `MAX_SERVER_PATTERN_LENGTH = 3` already accommodates `3ws`.
- Brand module from task 00: `import { THREE_WS_VANITY, hasThreeWsMark } from '../../src/solana/vanity/brand.js'`.
- The downstream code already handles both cases: it sets `mint_secret_key_b64` from `mintKeypair` when the server generated the key, and sets `client_supplied_mint: !mintKeypair`. **Preserve that contract** — when the server grinds, it owns the secret and returns it for co-sign exactly like the old `Keypair.generate()` path did.
- The kill-switch flag (task 07): read `env.THREE_WS_MARK_ENFORCE` (default ON). When OFF, skip enforcement/grinding and keep the legacy `Keypair.generate()` behavior so we can disable instantly without a redeploy of logic.

## Changes

Replace the mint section with mark-aware logic:

```js
// Mint pubkey: client-supplied (vanity-ground) or server-ground with the three.ws mark.
const enforceMark = env.THREE_WS_MARK_ENFORCE !== '0' && env.THREE_WS_MARK_ENFORCE !== 'false';
let mintKeypair = null;
let mint;

if (body.mint_address) {
  const supplied = solanaPubkey(body.mint_address);
  if (!supplied) return error(res, 400, 'validation_error', 'invalid mint_address');
  if (enforceMark && !hasThreeWsMark(supplied.toBase58())) {
    return error(res, 400, 'unbranded_mint',
      'three.ws launches must use a mint address carrying the "3ws" mark — grind one client-side or omit mint_address to let the server stamp it');
  }
  mint = supplied;
} else if (enforceMark) {
  const ground = await grindVanityNode({ ...THREE_WS_VANITY }); // ~49k attempts, sub-second
  mintKeypair = Keypair.fromSecretKey(ground.secretKey);
  mint = mintKeypair.publicKey;
} else {
  mintKeypair = Keypair.generate();
  mint = mintKeypair.publicKey;
}
```

- Keep `Keypair.fromSecretKey` import path consistent (`Keypair` is already imported at the top of the file).
- Leave `mint_secret_key_b64`, `client_supplied_mint`, and the `instructions` string exactly as they are — they already branch on `mintKeypair` truthiness and remain correct.
- Wrap the server grind in a try/catch: on `GrindExhaustedError` (effectively impossible for a 3-char case-insensitive prefix, but be a professional), return `error(res, 503, 'mark_grind_failed', 'could not stamp the three.ws mark — retry')`. Do **not** silently fall back to an unbranded mint when `enforceMark` is on (fail-closed).

## Constraints

- Do not change the schema's `mint_address` shape or any other field.
- Do not touch the generic x402 launcher path (different handler / arbitrary-mint plumbing) — this task is scoped to `handleLaunchPrep` only.
- The added imports go with the existing import block at the top of the file; do not import inside the handler.
- Net new code in the handler ≤ ~25 lines.

## Success criteria

- `POST /api/pump/launch-prep` with **no** `mint_address` returns a `mint` that satisfies `hasThreeWsMark(mint)`.
- `POST` with a `mint_address` lacking the mark returns `400 unbranded_mint`.
- `POST` with a correctly-marked `mint_address` succeeds and echoes that mint.
- With `THREE_WS_MARK_ENFORCE=0`, behavior is byte-for-byte the legacy flow.
- Existing launch-confirm flow still co-signs correctly (the server-ground secret is returned just like before).

## Verification

- Unit/integration in task 06 covers the three branches. Manually:
  ```bash
  # against a dev server with a valid session cookie
  curl -s -X POST localhost:3000/api/pump/launch-prep -H 'content-type: application/json' \
    --cookie "$SESSION" -d '{"agent_id":"…","wallet_address":"…","name":"T","symbol":"T","uri":"https://x/y.json"}' \
    | node -e "process.stdin.once('data',d=>{const j=JSON.parse(d);console.log(j.mint, /^3ws/i.test(j.mint))})"
  ```
