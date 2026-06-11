// Fire-and-forget usage event logging. Failures must never impact the request.

import { sql } from './db.js';
import { withDbRetry } from './db-retry.js';

export function recordEvent(evt) {
	// Intentionally not awaited in callers; we swallow errors here.
	queueMicrotask(async () => {
		try {
			// `client_id` carries a FK to oauth_clients(client_id). Callers that hand
			// us a non-OAuth handle (e.g. /forge's hashed anonymous client key) would
			// otherwise violate the constraint and lose the *entire* spend event. Coerce
			// any value that isn't a registered OAuth client to NULL via a scalar
			// subquery so telemetry is recorded regardless of attribution. The same
			// guard makes a stray null/unknown id a no-op rather than a dropped insert.
			await withDbRetry(() => sql`
				insert into usage_events (user_id, api_key_id, client_id, avatar_id, agent_id, kind, tool, status, bytes, latency_ms, meta, provider, model, input_tokens, output_tokens, cost_micro_usd)
				values (
					${evt.userId ?? null},
					${evt.apiKeyId ?? null},
					(select client_id from oauth_clients where client_id = ${evt.clientId ?? null}),
					${evt.avatarId ?? null},
					${evt.agentId ?? null},
					${evt.kind},
					${evt.tool ?? null},
					${evt.status ?? 'ok'},
					${evt.bytes ?? null},
					${evt.latencyMs ?? null},
					${JSON.stringify(evt.meta ?? {})}::jsonb,
					${evt.provider ?? null},
					${evt.model ?? null},
					${evt.inputTokens ?? null},
					${evt.outputTokens ?? null},
					${evt.costMicroUsd ?? null}
				)
			`);
		} catch (err) {
			console.warn('[usage] write failed', err?.message);
		}
	});
}

export function logger(name) {
	return {
		info: (msg, meta = {}) => console.log(JSON.stringify({ lvl: 'info', name, msg, ...meta })),
		warn: (msg, meta = {}) => console.warn(JSON.stringify({ lvl: 'warn', name, msg, ...meta })),
		error: (msg, meta = {}) =>
			console.error(JSON.stringify({ lvl: 'error', name, msg, ...meta })),
	};
}
