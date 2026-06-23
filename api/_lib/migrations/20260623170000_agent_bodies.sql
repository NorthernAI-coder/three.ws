begin;

-- Embodiment — the binding between a three.ws agent (a "mind") and a physical
-- (or simulated) humanoid body. This is the spine of the Embodiment suite: the
-- canonical record of which mind currently inhabits which body, how it is
-- reached, and the on-chain proof of the binding.
--
--   agent_bodies     — one row per body an agent has ever been paired to. At
--                      most ONE live (status in 'paired'|'active') row per agent
--                      at a time (a mind is in one body), enforced by a partial
--                      unique index. Unpairing sets status='unlinked' so the
--                      history is preserved (and a body can be re-paired later).
--   body_telemetry   — the append-only stream of REAL telemetry samples from the
--                      body (battery, joint faults, link quality). Never
--                      synthesized — a simulator writes its own genuine internal
--                      state, hardware writes the device's readings.
--
-- The pairing/unpairing itself is also written to the existing append-only,
-- signed `agent_actions` log (type 'embodiment.paired' / 'embodiment.unlinked').

create table if not exists agent_bodies (
	id              uuid primary key default gen_random_uuid(),
	agent_id        uuid not null references agent_identities(id) on delete cascade,
	-- Stable identifier for the physical/simulated unit (device serial, or a
	-- deterministic simulator id). Unique per agent so re-pairing the same unit
	-- updates the existing row instead of forking history.
	body_id         text not null,
	-- How the body is reached: 'simulator' (the on-screen <agent-3d> twin),
	-- 'webrtc-ros2' (a real bridge), or another registered adapter transport.
	transport       text not null,
	label           text,
	-- paired  — bound, not currently streaming
	-- active  — bound and live (telemetry flowing / being driven)
	-- fault   — bound but the body reported a fault / is in safe state
	-- unlinked— released; kept for history
	status          text not null default 'paired',
	-- Capability scope the owner granted this body (move/speak/spend/leave-room…).
	-- Deny-by-default: absent capability = not allowed. Task 07 hardens enforcement.
	capabilities    jsonb not null default '{}'::jsonb,
	-- On-chain proof of the binding (best-effort at pair time; an unfunded agent
	-- wallet stores the binding without a signature and the UI reports that
	-- honestly — never a fabricated tx).
	onchain_signature text,
	onchain_network   text,
	onchain_explorer  text,
	onchain_target    text,                                 -- agent authority the receipt was recorded against
	mind_snapshot_cid text,                                 -- IPFS CID of the loaded mind (Task 05 commits the hash here)
	meta            jsonb not null default '{}'::jsonb,
	last_telemetry  jsonb,
	last_telemetry_at timestamptz,
	bound_at        timestamptz not null default now(),
	unlinked_at     timestamptz,
	updated_at      timestamptz not null default now(),
	unique (agent_id, body_id)
);

-- A mind inhabits at most one live body at a time.
create unique index if not exists agent_bodies_one_live_per_agent
	on agent_bodies(agent_id)
	where status in ('paired', 'active', 'fault');

create index if not exists agent_bodies_agent_time
	on agent_bodies(agent_id, bound_at desc);
create index if not exists agent_bodies_status
	on agent_bodies(status, updated_at desc);

create table if not exists body_telemetry (
	id              bigserial primary key,
	body_id         uuid not null references agent_bodies(id) on delete cascade,
	agent_id        uuid not null references agent_identities(id) on delete cascade,
	-- Real sample payload: { battery_pct, charging, joints_ok, faults[],
	-- link_quality, pose_summary, simulated } — sourced from the device or the
	-- simulator's genuine internal state, with `simulated` flagged truthfully.
	sample          jsonb not null default '{}'::jsonb,
	captured_at     timestamptz not null,                   -- device/sim timestamp (never invented at write time)
	created_at      timestamptz not null default now()
);

create index if not exists body_telemetry_body_time
	on body_telemetry(body_id, captured_at desc);

commit;
