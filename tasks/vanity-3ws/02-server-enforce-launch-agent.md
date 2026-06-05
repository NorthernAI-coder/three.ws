# Task 02 — Enforce the `3ws` mark in `launch-agent` (server-signed / autonomous launches)

## Goal

The autonomous launch path — where the **agent custodial wallet signs server-side** — must
also stamp the `3ws` mark. This is the path used by /studio's "launch with agent wallet"
and by autonomous agent skills, so it cannot be left unbranded.

## Context

- File: `api/pump/[action].js`, `async function handleLaunchAgent(req, res)` (~line 1257).
- Current mint logic:

  ```js
  // Mint keypair: client-supplied (vanity) or server-generated.
  let mintKeypair;
  if (body.mint_address && body.mint_secret_key_b64) {
    try {
      mintKeypair = Keypair.fromSecretKey(
        Uint8Array.from(Buffer.from(body.mint_secret_key_b64, 'base64')),
      );
    } catch {
      return error(res, 400, 'validation_error', 'mint_secret_key_b64 did not parse');
    }
    if (mintKeypair.publicKey.toBase58() !== body.mint_address) {
      return error(res, 400, 'validation_error', 'mint_address does not match secret key');
    }
  } else {
    mintKeypair = Keypair.generate();
  }
  const mint = mintKeypair.publicKey;
  ```

- `launchAgentSchema` requires `mint_secret_key_b64` whenever `mint_address` is supplied (it `.refine()`s on that), because the server signs and therefore needs the mint secret.
- Brand + grinder imports are the same as task 01 (`THREE_WS_VANITY`, `hasThreeWsMark`, `grindVanityNode`, `GrindExhaustedError`). They will already be imported once task 01 lands — reuse, don't duplicate.
- Kill-switch: same `env.THREE_WS_MARK_ENFORCE` flag.

## Changes

Make both branches mark-aware:

```js
const enforceMark = env.THREE_WS_MARK_ENFORCE !== '0' && env.THREE_WS_MARK_ENFORCE !== 'false';
let mintKeypair;
if (body.mint_address && body.mint_secret_key_b64) {
  try {
    mintKeypair = Keypair.fromSecretKey(
      Uint8Array.from(Buffer.from(body.mint_secret_key_b64, 'base64')),
    );
  } catch {
    return error(res, 400, 'validation_error', 'mint_secret_key_b64 did not parse');
  }
  if (mintKeypair.publicKey.toBase58() !== body.mint_address) {
    return error(res, 400, 'validation_error', 'mint_address does not match secret key');
  }
  if (enforceMark && !hasThreeWsMark(mintKeypair.publicKey.toBase58())) {
    return error(res, 400, 'unbranded_mint',
      'three.ws launches must use a mint carrying the "3ws" mark — omit mint_address to let the server stamp it');
  }
} else if (enforceMark) {
  try {
    const ground = await grindVanityNode({ ...THREE_WS_VANITY });
    mintKeypair = Keypair.fromSecretKey(ground.secretKey);
  } catch (err) {
    if (err instanceof GrindExhaustedError) {
      return error(res, 503, 'mark_grind_failed', 'could not stamp the three.ws mark — retry');
    }
    throw err;
  }
} else {
  mintKeypair = Keypair.generate();
}
const mint = mintKeypair.publicKey;
```

- The rest of `handleLaunchAgent` (balance pre-flight, conflict check on `pump_agent_mints`, `vtx.sign([agentKeypair, mintKeypair])`) is unchanged — it already signs with `mintKeypair`, so a server-ground key flows through with zero further edits.

## Constraints

- Do not loosen the `mint_secret_key_b64`-required-with-`mint_address` refine — the server still needs the secret to sign.
- Fail-closed when enforcement is on (no silent unbranded fallback).
- Reuse the imports added in task 01; if task 01 hasn't landed yet, add them to the shared top-of-file import block (don't import inside the handler).

## Success criteria

- A server-signed launch with no supplied mint produces a `3ws…` mint and signs/submits successfully.
- A supplied-but-unmarked `{mint_address, mint_secret_key_b64}` pair is rejected `400 unbranded_mint`.
- The conflict check, balance pre-flight, and `pump_agent_mints` insert all still operate on the (now marked) mint.
- `THREE_WS_MARK_ENFORCE=0` restores legacy behavior exactly.

## Verification

- Covered by task 06 integration tests (mock the agent keypair load + connection). For a live smoke, `scripts/pumpfun-lifecycle-smoke.js` exercises the autonomous path against devnet — assert the resulting mint matches `/^3ws/i`.
