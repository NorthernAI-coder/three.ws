import { randomBytes } from 'crypto';
import { sql } from './db.js';
import { cacheWrap } from './cache.js';
import { sendReferralCommissionEmail } from './email.js';

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

/**
 * Credit a confirmed referral commission to the referrer and notify them by
 * email. This is the single write-side home for accruing referral earnings:
 * purchase-confirm.js computes the atomic amount on a confirmed sale and calls
 * here so the ledger write and the "you earned a commission" email live
 * together.
 *
 * `referral_earnings_total` accumulates atomic USDC units (6 decimals), the same
 * unit getMembershipCard / getReferredUsers read back.
 *
 * The DB credit is awaited (it's part of recording the sale); the email is
 * strictly best-effort — a send failure (or missing RESEND_API_KEY) is logged,
 * never thrown, so it can never roll back or block the commission credit.
 *
 * @param {object} args
 * @param {string|number} args.referrerUserId  who earned the commission
 * @param {bigint|number|string} args.amountAtomics  commission in atomic USDC units
 * @param {string} [args.currency]  display currency label (default 'USDC')
 * @param {string|null} [args.fromHandle]  public handle of the buyer who triggered it
 * @param {string|null} [args.skillName]  the skill that was sold
 * @returns {Promise<void>}
 */
export async function creditReferralCommission({
  referrerUserId,
  amountAtomics,
  currency = 'USDC',
  fromHandle = null,
  skillName = null,
}) {
  const amount = BigInt(amountAtomics);
  if (!referrerUserId || amount <= 0n) return;

  await sql`
    UPDATE users
    SET referral_earnings_total = COALESCE(referral_earnings_total, 0) + ${Number(amount)}
    WHERE id = ${referrerUserId}
  `;

  // Email is best-effort and never deliverable to synthetic Privy mailboxes.
  try {
    const [row] = await sql`
      SELECT email FROM users WHERE id = ${referrerUserId} AND deleted_at IS NULL
    `;
    const email = row?.email;
    if (email && !/@privy\.local$/i.test(email)) {
      const usd = (Number(amount) / 1_000_000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      await sendReferralCommissionEmail({
        to: email,
        amount: usd,
        currency,
        fromHandle,
        skillName,
        date,
      }).catch((e) => console.error('[referrals] commission email failed', e?.message));
    }
  } catch (e) {
    console.error('[referrals] commission email lookup failed', e?.message);
  }
}

// Points awarded per confirmed referral and per whole USD of referral earnings.
// Kept here (not inlined) so the score formula has a single, documented home.
const POINTS_PER_REFERRAL = 100;
const POINTS_PER_USD = 1;

// Referral commission, in basis points, applied to a referred user's confirmed
// purchase total to derive what the referrer earned. Mirrors the server default
// in api/_lib/purchase-confirm.js (REFERRAL_COMMISSION_BPS, default 500 = 5%) so
// the dashboard's per-user "commission" column matches what was actually accrued.
function referralBps() {
  const v = parseInt(process.env.REFERRAL_COMMISSION_BPS || '500', 10);
  return Number.isFinite(v) && v >= 0 ? v : 500;
}

// Pagination bounds for the per-referred-user list. Keeps the join cheap and
// the payload small while letting the UI page through large referral networks.
const REFERRALS_PAGE_DEFAULT = 20;
const REFERRALS_PAGE_MAX = 100;

function clampLimit(limit) {
  const n = Number.parseInt(limit, 10);
  if (!Number.isFinite(n) || n <= 0) return REFERRALS_PAGE_DEFAULT;
  return Math.min(n, REFERRALS_PAGE_MAX);
}

function clampOffset(offset) {
  const n = Number.parseInt(offset, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Real per-referred-user breakdown for an affiliate dashboard: who signed up
 * with this referrer, when, how much confirmed revenue they generated, and the
 * commission the referrer earned on it.
 *
 * Revenue is the sum of every CONFIRMED purchase a referred user made where this
 * user was the attributed referrer — across both monetization tables:
 *   • skill_purchases  (referrer_user_id, user_id, amount, status)
 *   • asset_purchases  (referrer_user_id, buyer_user_id, amount, status)
 * Amounts are atomic USDC units (6 decimals), the same unit purchase-confirm.js
 * accrues into users.referral_earnings_total. Commission is derived from the
 * configured referral BPS so the column matches what was actually credited.
 *
 * Sorted by revenue generated (desc), then most recent signup — the most
 * valuable referrals surface first. Paginated via limit/offset.
 *
 * @param {string|number} userId  the referrer
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number, referral_commission_bps: number }>}
 */
export async function getReferredUsers(userId, opts = {}) {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const bps = referralBps();

  // Total referred-user count drives pagination in the UI. Counts every active
  // account attributed to this referrer, regardless of whether they've spent.
  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total FROM users
    WHERE referred_by_id = ${userId} AND deleted_at IS NULL
  `;

  if (total === 0) {
    return { items: [], total: 0, limit, offset, referral_commission_bps: bps };
  }

  // Per-referred-user revenue, summed from both purchase tables. Each subquery
  // is correlated on the referred user's id AND keyed to this referrer so a
  // buyer's spend only counts toward the referrer who actually owns it. Only
  // confirmed sales count — pending/expired/failed rows are excluded.
  const rows = await sql`
    SELECT
      ru.id,
      ru.username,
      ru.display_name,
      ru.created_at AS signup_date,
      (
        COALESCE((
          SELECT SUM(sp.amount)::bigint
          FROM skill_purchases sp
          WHERE sp.user_id = ru.id
            AND sp.referrer_user_id = ${userId}
            AND sp.status = 'confirmed'
        ), 0)
        +
        COALESCE((
          SELECT SUM(ap.amount)::bigint
          FROM asset_purchases ap
          WHERE ap.buyer_user_id = ru.id
            AND ap.referrer_user_id = ${userId}
            AND ap.status = 'confirmed'
        ), 0)
      )::bigint AS revenue_generated
    FROM users ru
    WHERE ru.referred_by_id = ${userId} AND ru.deleted_at IS NULL
    ORDER BY revenue_generated DESC, ru.created_at DESC, ru.id
    LIMIT ${limit} OFFSET ${offset}
  `;

  const items = rows.map((r) => {
    const revenueAtomics = Math.max(0, Math.round(Number(r.revenue_generated || 0)));
    // Commission credited to the referrer = revenue * bps / 10000, floored to a
    // whole atomic unit to match the integer math in purchase-confirm.js.
    const commissionAtomics = Math.floor((revenueAtomics * bps) / 10000);
    return {
      user_id: r.id,
      username: r.username || null,
      display_name: r.display_name || r.username || null,
      signup_date: r.signup_date,
      revenue_generated: revenueAtomics,
      revenue_generated_usd: revenueAtomics / 1_000_000,
      commission_earned: commissionAtomics,
      commission_earned_usd: commissionAtomics / 1_000_000,
    };
  });

  return { items, total: Number(total || 0), limit, offset, referral_commission_bps: bps };
}

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
  // Platform-wide member count: a full-table COUNT(*) that is identical for
  // every viewer and grows monotonically — cache for 60s instead of scanning
  // users on every member-card render.
  const total = await cacheWrap('users:total:active', 60, async () => {
    const [{ total }] = await sql`
      SELECT COUNT(*)::int AS total FROM users WHERE deleted_at IS NULL
    `;
    return total;
  });

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
