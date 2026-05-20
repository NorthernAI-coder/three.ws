# Task: Fix referral-code uniqueness race in signup

## Repo context

Working tree: `/workspaces/three.ws`. The signup handler is in
`api/auth/[action].js`. Around line 109, after the user is inserted,
a referral code is generated for the new account:

```js
// TODO: loop until referral code is unique
const newReferralCode = generateReferralCode();
const [user] = await sql`insert into users (... referral_code) values (... ${newReferralCode}) returning ...`;
```

`generateReferralCode()` returns a short string (likely 6-8 alphanumeric
chars). The `users.referral_code` column has a unique index — so two
simultaneous signups can collide and the second one will fail with a
Postgres unique-violation, returning a confusing 500 to the user.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Real APIs only — the fix must work against the real Postgres unique
  index, not a sentinel check.
- Errors handled at boundaries only — the loop is at the boundary
  (insert), so a try/catch on the unique-violation error code is the
  right level.
- Done = the TODO comment is gone, the race is closed, `npm test`
  green.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — confirm the unique index exists

```bash
grep -rn "referral_code" /workspaces/three.ws/migrations/
```

If `users.referral_code` has a unique index, the retry loop is the
fix. If it does not, **add a migration that creates the unique index**
first, then add the retry loop. Both pieces ship in the same diff.

A unique partial index is fine if `referral_code` is nullable:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique
  ON users (referral_code)
  WHERE referral_code IS NOT NULL;
```

### Step 2 — implement the retry loop

Replace the current single-shot generation with a bounded retry. The
postgres unique-violation `SQLSTATE` is `23505`.

```js
async function insertUserWithUniqueReferralCode(fields) {
  const MAX_TRIES = 8;
  for (let i = 0; i < MAX_TRIES; i += 1) {
    const code = generateReferralCode();
    try {
      const [row] = await sql`
        insert into users (email, password_hash, display_name, referred_by_id, referral_code)
        values (${fields.email}, ${fields.passwordHash}, ${fields.displayName}, ${fields.referredById}, ${code})
        returning id, display_name, plan, created_at, referral_code
      `;
      return row;
    } catch (err) {
      // Postgres unique-violation
      if (err && err.code === '23505' && /referral_code/.test(err.message || '')) {
        continue; // try a new code
      }
      throw err;
    }
  }
  throw new Error('referral_code_generation_exhausted');
}
```

Use it in place of the existing `const newReferralCode = ...; const
[user] = await sql\`insert ...\`;` block. Delete the TODO comment.

The `referral_code_generation_exhausted` error should be caught
upstream in the handler and converted into a 500 with a short message
— but in practice the probability of 8 consecutive collisions on an
8-char alphanumeric space (62^8 ≈ 2.18e14) is vanishingly small unless
`generateReferralCode()` itself is broken.

### Step 3 — confirm `generateReferralCode()` has enough entropy

```bash
grep -rn "generateReferralCode" /workspaces/three.ws/src /workspaces/three.ws/api
```

Read the implementation. It must use a CSPRNG (`crypto.randomUUID()`
substring, or `crypto.getRandomValues()`, or Node's `crypto.
randomBytes`). It must **not** use `Math.random()`. If it does, fix it
in the same diff — that is a real bug.

### Step 4 — add a unit test

Create or extend `tests/auth-signup.test.js`. Use vitest. The test:

1. Sets up an in-memory or test-db connection (read other tests in
   `tests/` to find the pattern used; do not invent a new DB harness).
2. Inserts a user with a known referral_code.
3. Stubs `generateReferralCode` to return the same code on the first
   call and a different code on the second call.
4. Calls the signup handler.
5. Asserts the inserted user has the **second** referral_code.
6. Asserts no error was returned to the client.

If the repo's other tests use Vercel handler harnesses (`node-mocks-
http` or similar), match that pattern.

### Step 5 — run the suite

```bash
npm test
```

### Step 6 — manual smoke

```bash
npm run dev
# signup with curl, confirm 201 and a referral_code in the response
```

Run the curl twice with two different emails; confirm both succeed.

## Definition of done

- The `// TODO: loop until referral code is unique` comment in
  `api/auth/[action].js` is gone.
- The collision-retry loop is in place and bounded.
- `generateReferralCode()` uses a CSPRNG.
- A test covers the collision path.
- `npm test` is green.
- Two consecutive signups via `curl` both return 201.

## Constraints

- Do not raise `MAX_TRIES` above 8. If you find yourself wanting to,
  the generator's entropy is too low — fix the generator instead.
- Do not log the referral code at error level. It's user-facing data;
  keep it out of error logs.
- Do not change the response shape of the signup endpoint.
- Do not remove the unique index even if you add the retry loop. The
  index is the authoritative guard; the retry loop is the UX shield.
