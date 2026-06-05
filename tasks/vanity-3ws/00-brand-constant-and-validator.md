# Task 00 — The `3ws` brand constant + validator (single source of truth)

## Goal

Create one module that owns the `3ws` mint mark: its grind config and the functions that
test/assert an address carries it. Every other task imports from here. No other file may
hardcode the string `'3ws'` or re-implement the check.

## Context

- The vanity grinders already accept `{ prefix, suffix, ignoreCase }`:
  - Client: `src/solana/vanity/grinder.js` → `grindVanity(opts)`
  - Server: `src/solana/vanity/grinder-node.js` → `grindVanityNode(opts)`, plus `expectedAttemptsFor`, `GrindExhaustedError`, `MAX_SERVER_PATTERN_LENGTH = 3`.
- Base58 validation lives in `src/solana/vanity/validation.js` (`validatePattern`, `BASE58_ALPHABET`). `3ws` passes (`3`,`w`,`s` are all valid, none confusable).
- `CLAUDE.md`: never reference any coin but `$THREE`. This module references *no* coin — it is pure address plumbing — so it is compliant by construction. Keep it that way.

## New file — `src/solana/vanity/brand.js`

Export, with thorough JSDoc:

```js
/** The three.ws on-chain mint mark. Every branded launch's mint address starts with this. */
export const THREE_WS_MARK = '3ws';

/**
 * Grind config for the brand mark. Spread into grindVanity / grindVanityNode.
 * Prefix (leads the truncated address) + case-insensitive (keeps the grind sub-second).
 */
export const THREE_WS_VANITY = Object.freeze({
  prefix: THREE_WS_MARK,
  suffix: '',
  ignoreCase: true,
});

/** True when a Base58 mint address carries the three.ws mark (case-insensitive prefix). */
export function hasThreeWsMark(address) {
  if (typeof address !== 'string' || address.length < THREE_WS_MARK.length) return false;
  return address.slice(0, THREE_WS_MARK.length).toLowerCase() === THREE_WS_MARK.toLowerCase();
}

/**
 * Throw a typed error if `address` lacks the mark. Use at trust boundaries
 * (API handlers) to fail-closed on an unbranded supplied mint.
 * @throws {UnbrandedMintError}
 */
export function assertThreeWsMark(address) {
  if (!hasThreeWsMark(address)) throw new UnbrandedMintError(address);
}

export class UnbrandedMintError extends Error {
  constructor(address) {
    super(`mint ${String(address).slice(0, 12)}… does not carry the three.ws "${THREE_WS_MARK}" mark`);
    this.name = 'UnbrandedMintError';
    this.code = 'unbranded_mint';
    this.address = address;
  }
}
```

Design notes to honor:
- **No coin references.** This is address plumbing only.
- **Frozen config** so a caller can't mutate the shared object.
- `hasThreeWsMark` must be **isomorphic** (no Node- or browser-only APIs) — it is imported by both `api/` handlers and browser bundles.
- Keep the position (`prefix`) and case behavior expressed *only* here. If we ever move the
  mark to a suffix or make it case-sensitive, this is the one edit.

## Constraints

- ≤ 60 lines. Pure, dependency-free (may import nothing, or only from `./validation.js` if
  you choose to assert `validatePattern(THREE_WS_MARK).valid` in a dev assertion — optional).
- Do not import `@solana/web3.js` here (keep it tree-shakeable for the browser).

## Success criteria

- `hasThreeWsMark('3wsAbc…')` → `true`; `hasThreeWsMark('3WSabc…')` → `true`;
  `hasThreeWsMark('Abc3ws…')` → `false`; `hasThreeWsMark('')`/`null`/`undefined` → `false`.
- `assertThreeWsMark` throws `UnbrandedMintError` (with `.code === 'unbranded_mint'`) on a
  bad address and returns nothing on a good one.
- A repo-wide grep finds the literal `'3ws'` **only** in `brand.js` after all tasks land
  (every other file imports `THREE_WS_MARK` / `THREE_WS_VANITY`).

## Verification

```bash
node -e "import('./src/solana/vanity/brand.js').then(m=>{
  console.assert(m.hasThreeWsMark('3wsXyzAbc')===true);
  console.assert(m.hasThreeWsMark('3WSxyzAbc')===true);
  console.assert(m.hasThreeWsMark('zzz3wsAbc')===false);
  try { m.assertThreeWsMark('nope'); console.error('FAIL: did not throw'); }
  catch(e){ console.assert(e.code==='unbranded_mint'); }
  console.log('brand.js OK');
})"
```
