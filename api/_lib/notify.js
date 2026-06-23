/**
 * In-app notification insert + multi-channel fan-out.
 *
 * insertNotification() is the single choke point every notification flows
 * through (sales, purchases, IRL, pump alerts, withdrawals…). It:
 *   1. inserts the in-app row (the bell inbox) — the durable record,
 *   2. records a `sent` funnel event for in_app,
 *   3. fans out to Web Push for the categories the user left enabled,
 *   4. records a `sent` event per push delivery.
 *
 * Every channel is gated by the user's preference center (api/_lib/notify-prefs)
 * so there is no notification a user can't turn off. Failures are logged, never
 * thrown — callers must not depend on this for correctness and need not await.
 *
 * @param {string} userId
 * @param {string} type      e.g. 'skill_purchased' (see notify-prefs TYPE_CATEGORY)
 * @param {object} payload
 * @returns {Promise<{ id: string|null }>}
 */
import { sql } from './db.js';
import { resolvePrefs, channelEnabled, pushPayloadFor, categoryForType } from './notify-prefs.js';
import { sendPushToUser } from './web-push.js';

export function insertNotification(userId, type, payload = {}) {
	return deliver(userId, type, payload).catch((err) => {
		console.error('[notify] delivery failed:', err.message);
		return { id: null };
	});
}

async function deliver(userId, type, payload) {
	// 1 — durable in-app row.
	let id = null;
	try {
		const [row] = await sql`
			insert into user_notifications (user_id, type, payload)
			values (${userId}, ${type}, ${JSON.stringify(payload)}::jsonb)
			returning id
		`;
		id = row?.id ?? null;
	} catch (err) {
		console.error('[notify] insert failed:', err.message);
		return { id: null };
	}

	// 2 — record the in-app send (the bell is always delivered).
	recordEvent(id, userId, 'in_app', 'sent');

	// 3 + 4 — push fan-out, gated by preferences.
	try {
		const prefs = await resolvePrefs(userId);
		if (channelEnabled(prefs, type, 'push')) {
			const delivered = await sendPushToUser(userId, pushPayloadFor(type, payload, id));
			if (delivered > 0) recordEvent(id, userId, 'push', 'sent', { count: delivered });
		}
	} catch (err) {
		console.error('[notify] push fan-out failed:', err.message);
	}

	return { id };
}

/**
 * Fire-and-forget funnel event. Sent rows are unconstrained (a notification can
 * be sent on several channels); opened/returned are deduped by a partial unique
 * index, so a double notificationclick is idempotent.
 */
export function recordEvent(notificationId, userId, channel, event, meta = {}) {
	if (!userId || !channel || !event) return;
	sql`
		insert into notification_events (notification_id, user_id, channel, event, meta)
		values (${notificationId}, ${userId}, ${channel}, ${event}, ${JSON.stringify(meta)}::jsonb)
		on conflict do nothing
	`.catch((err) => console.error('[notify] event insert failed:', err.message));
}

/**
 * Whether a transactional email for `type` should be sent, per the user's
 * preferences. Used by the few endpoints that send category email directly
 * (receipts, sale alerts) so email honours the same off switch as push.
 * Fails open (returns true) on a lookup error — better a wanted receipt than a
 * dropped one.
 */
export async function emailAllowedForType(userId, type) {
	try {
		const prefs = await resolvePrefs(userId);
		return channelEnabled(prefs, type, 'email');
	} catch {
		return true;
	}
}

export { categoryForType };
