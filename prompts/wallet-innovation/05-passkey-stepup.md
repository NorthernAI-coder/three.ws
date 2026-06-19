# 05 — Passkey Step-Up: phishing-resistant, hardware-backed authorization

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

The most dangerous custodial actions — sweeping a large balance, unfreezing a
flagged wallet, disabling spend limits, raising caps, exporting a key — are
gated today only by a session cookie + CSRF. A stolen session, a phished login,
or a malicious script on a same-site surface could trigger any of them. For
people's money, the highest-stakes actions deserve the strongest, **phishing-
resistant** proof that the real human owner — on their real device — approved
*this specific action*.

## The game-changing feature

Bind sensitive custodial actions to the owner's **device passkey / biometric via
real WebAuthn**. Approving a big withdrawal becomes Face ID / Touch ID / security
key — cryptographically bound to the action, impossible to phish or replay, and
not extractable from a server breach. And design the passkey assertion so it can
serve as the **owner-controlled share/factor** that `01-mpc-threshold-custody.md`
needs for high-risk signing — one trust anchor, reused.

## What to build (wire all of it, for real)

1. **Passkey registration.** Real WebAuthn registration ceremony
   (`navigator.credentials.create`) tied to the authenticated user; store the
   credential public key, id, sign count, transports, and AAGUID server-side
   (new table via migration). Use a maintained, audited WebAuthn server library
   — verify attestation properly; do not hand-roll the crypto.
2. **Step-up assertion on sensitive actions.** A real assertion ceremony
   (`navigator.credentials.get`) whose **challenge is bound to the specific
   action** (e.g. hash of `{action, agentId, amount, destination, nonce, exp}`),
   server-verified (signature, challenge match, origin/RP id, sign-count
   monotonicity for clone detection). The action proceeds only on a valid
   assertion. Short-lived, single-use challenges; replay-proof.
3. **Owner-configurable step-up policy.** Let owners choose which actions require
   step-up and above what thresholds (e.g. "passkey for any withdrawal over
   $100, and always for unfreeze / disabling limits / key export"). Store in
   `meta`; enforce server-side in the relevant handlers
   (`solana-wallet.js` withdraw/limits, the freeze toggle, key export).
   Sensible secure defaults out of the box.
4. **Graceful, secure fallbacks.** No passkey registered yet → guide the owner
   to add one, and for the highest-risk actions require registration rather than
   silently allowing the weaker path. Account-recovery story for a lost device
   must be deliberate and documented — never an open backdoor.
5. **Integration seam for threshold custody.** Expose the verified-step-up result
   in a shape `01` can consume as the owner factor for high-risk signing. Define
   the interface even if `01` lands later.

## UX / UI

- A "Security" surface in the wallet hub: register/add passkeys (named devices),
  list/revoke them, set step-up thresholds. Beautiful, reassuring, accessible.
- The step-up prompt at action time: clear summary of *exactly* what's being
  authorized ("Withdraw 5.0 SOL to AbCd…WxYz"), then the native biometric. All
  states: no-passkey, prompting, success, cancelled, failed (actionable),
  unsupported-browser (honest fallback). Respect platform/browser capabilities.

## Security & correctness

- Correct RP id / origin validation; reject cross-origin assertions. Challenges
  are server-generated, single-use, expiring, and bound to the action payload —
  a captured assertion can't authorize a *different* action.
- Sign-count regression → treat as possible cloned authenticator → block + alert.
- Never store anything that could forge an assertion; the private key never
  leaves the owner's device. No secret in logs/responses.
- Rate-limit + lock out brute force on the verification endpoint.

## Testing

- Unit/integration tests using a WebAuthn test harness/virtual authenticator:
  successful register + assert, wrong-challenge rejection, replay rejection,
  sign-count regression rejection, origin/RP mismatch rejection, action-binding
  (assertion for action A cannot authorize action B).

## Deliverables

Real WebAuthn register + step-up assertion (audited lib), action-bound
challenges, owner-configurable step-up policy enforced server-side on the
sensitive handlers, Security UI to manage passkeys + thresholds, documented
recovery story, integration seam for `01`, new migration, tests, changelog
(security/feature).

## Before you finish

Then improve it: make the step-up summary unmistakable (show the destination and
amount the human is actually approving, with the allowlist badge), and add
"require passkey to disable any safety feature" as a default so protections can't
be quietly turned off. Verify with a real virtual authenticator in the browser,
review your diff, then **delete this prompt file.**
