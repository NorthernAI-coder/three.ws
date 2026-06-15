import { randomBytes } from 'crypto';
import { sql } from './db.js';

/**
 * Generates a random, human-readable referral code.
 * @param {number} length The desired length of the code.
 * @returns {string} A random referral code.
 */
export function generateReferralCode(length = 8) {
  // Using a base32-like alphabet to avoid ambiguous characters (0/O, 1/I/l)
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  const randomValues = randomBytes(length);

  for (let i = 0; i < length; i++) {
    code += alphabet[randomValues[i] % alphabet.length];
  }

  return code;
}

// Every user is a potential referrer, but only the email + SAML signup paths
// mint a `referral_code` up front. Privy / SIWS / SIWE sign-ups (and any
// pre-existing account) land with a NULL code. This lazily assigns one the
// first time the user needs it — idempotent and race-safe via the UNIQUE
// constraint + `WHERE referral_code IS NULL` guard.
//
// @param {string|number} userId
// @returns {Promise<string>} the user's referral code
export async function ensureReferralCode(userId) {
  const [existing] = await sql`SELECT referral_code FROM users WHERE id = ${userId}`;
  if (existing?.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateReferralCode();
    try {
      const [row] = await sql`
        UPDATE users SET referral_code = ${code}
        WHERE id = ${userId} AND referral_code IS NULL
        RETURNING referral_code
      `;
      if (row?.referral_code) return row.referral_code;
      // A concurrent request assigned one first — read it back.
      const [now] = await sql`SELECT referral_code FROM users WHERE id = ${userId}`;
      if (now?.referral_code) return now.referral_code;
    } catch (err) {
      // 23505 = unique_violation: this random code collided with another user's.
      // Retry with a fresh code.
      if (err && err.code === '23505') continue;
      throw err;
    }
  }
  throw new Error('referral_code_generation_exhausted');
}

// Points awarded per confirmed referral and per whole USD of referral earnings.
// Kept here (not inlined) so the score formula has a single, documented home.
const POINTS_PER_REFERRAL = 100;
const POINTS_PER_USD = 1;

/**
 * Assemble the full membership-card payload for a user: signup position,
 * referral code + count, lifetime referral earnings, and a derived score.
 *
 * `position` is the account's 1-based signup ordinal ("member #N"), a real,
 * monotonic number — not a synthetic rank. `score` is derived purely from
 * real referral activity so it can never drift from the underlying ledger.
 *
 * @param {string|number} userId
 * @returns {Promise<object|null>} card payload, or null if the user is gone
 */
export async function getMembershipCard(userId) {
  const [user] = await sql`
    SELECT id, display_name, username, created_at, referral_code, referral_earnings_total
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
  `;
  if (!user) return null;

  const referralCode = user.referral_code || (await ensureReferralCode(userId));

  const [{ count: referralCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM users
    WHERE referred_by_id = ${userId} AND deleted_at IS NULL
  `;
  const [{ position }] = await sql`
    SELECT COUNT(*)::int AS position FROM users
    WHERE id <= ${userId} AND deleted_at IS NULL
  `;
  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total FROM users WHERE deleted_at IS NULL
  `;

  // `referral_earnings_total` accumulates atomic USDC units (6 decimals),
  // written by api/_lib/purchase-confirm.js.
  const earningsAtomics = Math.max(0, Math.round(Number(user.referral_earnings_total || 0)));
  const earningsUsd = earningsAtomics / 1_000_000;
  const referrals = Number(referralCount || 0);
  const score = referrals * POINTS_PER_REFERRAL + Math.floor(earningsUsd) * POINTS_PER_USD;

  return {
    referral_code: referralCode,
    referred_users_count: referrals,
    referral_earnings_total: earningsAtomics,
    referral_earnings_usd: earningsUsd,
    position,
    total_members: Number(total || 0),
    score,
    display_name: user.display_name || user.username || null,
    username: user.username || null,
    member_since: user.created_at,
  };
}
