// Crews store — the durable crew (clan) graph for the /play world (W09). Every
// function takes the authenticated account id (a users.id UUID) as its first
// argument and keeps the roster + invites consistent. Presence (which member is
// online / where) is volatile and lives in Redis (presence-store.js); only the
// crew identity, roster, and pending invites live here.
//
// Mirrors the shape of friends-store.js so the two social systems read alike: a
// lazily-built public-columns fragment, a toProfile() projector, and small
// single-purpose queries the api/crews/* endpoints wrap thinly.

import { sql } from './db.js';

// Columns safe to expose for any account — never leak email, wallet, plan, or
// admin flags through a crew roster. Built lazily so importing this module never
// instantiates the Neon client (endpoints stay cold-start cheap without a DB).
let _publicUserCols;
const publicUserCols = () =>
	(_publicUserCols ??= sql`u.id, u.display_name, u.username, u.avatar_url`);

function toProfile(row) {
	if (!row) return null;
	return {
		id: row.id,
		name: row.display_name || row.username || 'Anonymous',
		username: row.username || null,
		avatarUrl: row.avatar_url || null,
	};
}

// A crew tag is a short clan badge: 2–6 chars, letters/digits only, upper-cased
// for display. Returns '' for anything that can't be a tag so callers can reject.
export function normalizeTag(raw) {
	const t = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
	return t.length >= 2 && t.length <= 6 ? t : '';
}

function normalizeName(raw) {
	return String(raw || '')
		.replace(/[\x00-\x1f\x7f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 32);
}

function err(message, status, code) {
	return Object.assign(new Error(message), { status, code });
}

// ── lookups ──────────────────────────────────────────────────────────────────
// The crew an account belongs to, as { id, tag, name, role, memberCount } — or
// null if they're in no crew. This is the hot path the presence-ticket signer
// calls on every sign-in, so it's one round-trip.
export async function getMyCrew(accountId) {
	const [row] = await sql`
		select c.id, c.tag, c.name, c.owner_id, m.role,
		       (select count(*)::int from crew_members cm where cm.crew_id = c.id) as member_count
		from crew_members m
		join crews c on c.id = m.crew_id
		where m.account_id = ${accountId}
		limit 1
	`;
	if (!row) return null;
	return {
		id: row.id,
		tag: row.tag,
		name: row.name,
		role: row.role,
		isOwner: row.owner_id === accountId,
		memberCount: row.member_count,
	};
}

// Just the crew tag for an account — what the presence ticket embeds so the game
// server can stamp a trustworthy tag over the avatar. Returns { tag, name } or null.
export async function crewTagFor(accountId) {
	const [row] = await sql`
		select c.tag, c.name from crew_members m
		join crews c on c.id = m.crew_id
		where m.account_id = ${accountId}
		limit 1
	`;
	return row ? { tag: row.tag, name: row.name } : null;
}

// Batch tag lookup for a set of accounts → { accountId: { tag, name } }. Used to
// annotate rosters / search results with crew membership in one query.
export async function crewTagsFor(accountIds) {
	const ids = [...new Set((accountIds || []).filter(Boolean))];
	if (!ids.length) return {};
	const rows = await sql`
		select m.account_id, c.tag, c.name from crew_members m
		join crews c on c.id = m.crew_id
		where m.account_id = any(${ids})
	`;
	const out = {};
	for (const r of rows) out[r.account_id] = { tag: r.tag, name: r.name };
	return out;
}

// The full roster for a crew, owner first then by join time. Each entry carries
// the public profile + role; presence is merged at the endpoint layer (Redis).
export async function listMembers(crewId) {
	const rows = await sql`
		select ${publicUserCols()}, m.role, m.joined_at
		from crew_members m
		join users u on u.id = m.account_id
		where m.crew_id = ${crewId} and u.deleted_at is null
		order by (m.role = 'owner') desc, m.joined_at asc
	`;
	return rows.map((r) => ({ ...toProfile(r), role: r.role, joinedAt: r.joined_at }));
}

// Public view of a crew by tag: identity + roster. Returns null if no such tag.
export async function getCrewByTag(tag) {
	const norm = normalizeTag(tag);
	if (!norm) return null;
	const [c] = await sql`
		select id, tag, name, owner_id, created_at from crews where lower(tag) = lower(${norm}) limit 1
	`;
	if (!c) return null;
	return {
		id: c.id,
		tag: c.tag,
		name: c.name,
		createdAt: c.created_at,
		members: await listMembers(c.id),
	};
}

// Pending invites addressed to an account → [{ crewId, tag, name, inviter, createdAt }].
export async function listInvites(accountId) {
	const rows = await sql`
		select i.crew_id, i.created_at, c.tag, c.name,
		       inv.id as inviter_id, inv.display_name as inviter_name, inv.username as inviter_username
		from crew_invites i
		join crews c on c.id = i.crew_id
		join users inv on inv.id = i.inviter_id
		where i.invitee_id = ${accountId}
		order by i.created_at desc
	`;
	return rows.map((r) => ({
		crewId: r.crew_id,
		tag: r.tag,
		name: r.name,
		inviter: { id: r.inviter_id, name: r.inviter_name || r.inviter_username || 'Someone' },
		createdAt: r.created_at,
	}));
}

// ── mutations ────────────────────────────────────────────────────────────────
// Found a new crew. The founder becomes the owner and first member. Guards a
// duplicate tag and an account that's already in a crew (one-crew-per-account).
export async function createCrew(accountId, rawTag, rawName) {
	const tag = normalizeTag(rawTag);
	if (!tag) throw err('Tag must be 2–6 letters or digits.', 400, 'bad_tag');
	const name = normalizeName(rawName) || tag;
	if (name.length < 2) throw err('Crew name is too short.', 400, 'bad_name');

	if (await getMyCrew(accountId)) {
		throw err('Leave your current crew before founding a new one.', 409, 'already_in_crew');
	}
	const [clash] = await sql`select 1 from crews where lower(tag) = lower(${tag}) limit 1`;
	if (clash) throw err('That tag is taken.', 409, 'tag_taken');

	const [crew] = await sql`
		insert into crews (tag, name, owner_id) values (${tag}, ${name}, ${accountId})
		returning id, tag, name
	`;
	await sql`
		insert into crew_members (crew_id, account_id, role) values (${crew.id}, ${accountId}, 'owner')
	`;
	return { id: crew.id, tag: crew.tag, name: crew.name, role: 'owner', isOwner: true, memberCount: 1 };
}

// Invite an account to my crew. I must be a member; the target must exist, not be
// muted-irrelevant here, not already be in a crew, and not already invited. Returns
// the invitee's public profile so the caller can fire a live toast.
export async function invite(accountId, targetId) {
	if (targetId === accountId) throw err('You cannot invite yourself.', 400, 'self_invite');
	const crew = await getMyCrew(accountId);
	if (!crew) throw err('You are not in a crew.', 400, 'no_crew');

	const [target] = await sql`select ${publicUserCols()} from users u where u.id = ${targetId} and u.deleted_at is null`;
	if (!target) throw err('User not found.', 404, 'not_found');

	const [member] = await sql`select 1 from crew_members where account_id = ${targetId} limit 1`;
	if (member) throw err('They are already in a crew.', 409, 'target_in_crew');

	await sql`
		insert into crew_invites (crew_id, inviter_id, invitee_id) values (${crew.id}, ${accountId}, ${targetId})
		on conflict (crew_id, invitee_id) do nothing
	`;
	return { crew, invitee: toProfile(target) };
}

// Accept an invite to a crew. Validates the invite exists for me and that I'm not
// already in a crew (an invite I accept after joining elsewhere is rejected, then
// cleaned up). Inserts membership and clears every invite I had pending.
export async function acceptInvite(accountId, crewId) {
	const [inv] = await sql`
		select 1 from crew_invites where crew_id = ${crewId} and invitee_id = ${accountId} limit 1
	`;
	if (!inv) throw err('No pending invite from that crew.', 404, 'no_invite');
	if (await getMyCrew(accountId)) {
		await sql`delete from crew_invites where crew_id = ${crewId} and invitee_id = ${accountId}`;
		throw err('Leave your current crew first.', 409, 'already_in_crew');
	}
	const [crew] = await sql`select id, tag, name from crews where id = ${crewId} limit 1`;
	if (!crew) {
		await sql`delete from crew_invites where invitee_id = ${accountId}`;
		throw err('That crew no longer exists.', 404, 'not_found');
	}
	await sql`
		insert into crew_members (crew_id, account_id, role) values (${crewId}, ${accountId}, 'member')
	`;
	// Clear all of my pending invites — I've made my choice.
	await sql`delete from crew_invites where invitee_id = ${accountId}`;
	return { id: crew.id, tag: crew.tag, name: crew.name, role: 'member', isOwner: false };
}

export async function declineInvite(accountId, crewId) {
	await sql`delete from crew_invites where crew_id = ${crewId} and invitee_id = ${accountId}`;
	return { ok: true };
}

// Leave my crew. If I'm the owner, ownership passes to the longest-tenured
// remaining member; if I was the last member, the crew is deleted outright (its
// invites cascade away). Keeps a crew from ever being orphaned with no owner.
export async function leaveCrew(accountId) {
	const crew = await getMyCrew(accountId);
	if (!crew) throw err('You are not in a crew.', 400, 'no_crew');

	await sql`delete from crew_members where crew_id = ${crew.id} and account_id = ${accountId}`;

	const remaining = await sql`
		select account_id from crew_members where crew_id = ${crew.id}
		order by joined_at asc limit 1
	`;
	if (!remaining.length) {
		await sql`delete from crews where id = ${crew.id}`; // cascades members + invites
		return { ok: true, disbanded: true };
	}
	if (crew.isOwner) {
		const heir = remaining[0].account_id;
		await sql`update crews set owner_id = ${heir} where id = ${crew.id}`;
		await sql`update crew_members set role = 'owner' where crew_id = ${crew.id} and account_id = ${heir}`;
	}
	return { ok: true, disbanded: false };
}

// Owner-only: remove another member from the crew. The owner can't kick themselves
// (they leave instead, which hands off ownership).
export async function kickMember(accountId, targetId) {
	const crew = await getMyCrew(accountId);
	if (!crew) throw err('You are not in a crew.', 400, 'no_crew');
	if (!crew.isOwner) throw err('Only the crew owner can remove members.', 403, 'not_owner');
	if (targetId === accountId) throw err('Use leave to step down as owner.', 400, 'self_kick');
	const rows = await sql`
		delete from crew_members where crew_id = ${crew.id} and account_id = ${targetId}
		returning account_id
	`;
	if (!rows.length) throw err('They are not in your crew.', 404, 'not_member');
	return { ok: true };
}
