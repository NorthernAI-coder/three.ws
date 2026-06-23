// Genome ⇆ agent glue. Loads the heritable slice of an agent (the fields
// api/_lib/genome.js reads), resolves an agent's genome (stored or founder-derived),
// and centralizes the breeding-eligibility + cooldown + stud-consent rules so the
// preview, breed, and lineage endpoints agree on one source of truth.

import { sql } from './db.js';
import {
	genomeFromAgent,
	normalizeGenome,
	GENOME_VERSION,
	pedigreeScore,
	voiceSettings,
	appearanceFromGenome,
	composePersonaPrompt,
	expressedSkills,
} from './genome.js';

// Client-safe projection of a genome — everything needed to render the predicted
// offspring (traits, voice settings + voice_id for a real TTS sample, bakeable
// appearance, skill alleles, mutations, pedigree). Carries no secret; a genome
// never holds one.
export function publicGenome(genome, name = 'Offspring') {
	const g = normalizeGenome(genome);
	return {
		version: g.version,
		generation: g.generation,
		brain: g.brain,
		voice: {
			provider: g.voice.provider,
			voice_id: g.voice.voice_id,
			model: g.voice.model,
			pitch: g.voice.pitch,
			settings: voiceSettings(g),
		},
		appearance: appearanceFromGenome(g),
		skills: g.skills,
		expressed_skills: expressedSkills(g),
		mutations: g.mutations,
		persona_prompt: composePersonaPrompt(g, name),
		pedigree: pedigreeScore(g),
	};
}

// A parent can breed at most once per cooldown window — keeps deep pedigrees
// scarce and blocks spam-minting offspring. Per agent, regardless of who breeds it.
export const BREED_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// Load every column genome derivation needs, joined to the backing avatar so we
// have its GLB storage key + appearance for body synthesis.
export async function loadBreedingAgent(agentId) {
	const [row] = await sql`
		select i.id, i.user_id, i.name, i.meta, i.skills, i.is_public,
		       i.persona_prompt, i.persona_tone_tags,
		       i.voice_provider, i.voice_id, i.voice_model, i.voice_settings,
		       i.avatar_id,
		       a.storage_key as avatar_storage_key,
		       a.appearance  as avatar_appearance,
		       a.visibility  as avatar_visibility,
		       a.name        as avatar_name
		from agent_identities i
		left join avatars a on a.id = i.avatar_id and a.deleted_at is null
		where i.id = ${agentId} and i.deleted_at is null
		limit 1
	`;
	return row || null;
}

// Shape a DB row into the object genomeFromAgent() consumes. A stored genome on
// meta.genome wins; otherwise a stable founder genome is derived from real traits.
export function agentGenome(row) {
	const meta = row.meta || {};
	if (meta.genome && meta.genome.version === GENOME_VERSION) return normalizeGenome(meta.genome);
	return genomeFromAgent({
		id: row.id,
		meta,
		persona_tone_tags: row.persona_tone_tags || meta.persona_tone_tags || [],
		voice_provider: row.voice_provider,
		voice_id: row.voice_id,
		voice_model: row.voice_model,
		voice_settings: row.voice_settings,
		appearance: row.avatar_appearance || meta.appearance || {},
		skills: row.skills || [],
		avatar_id: row.avatar_id,
	});
}

// The owner-set breeding policy for an agent (defaults: own-use breedable, not a
// public stud, no fee). Lives on meta.genome_breeding.
export function breedingPolicy(row) {
	const p = (row.meta || {}).genome_breeding || {};
	return {
		breedable: p.breedable !== false,
		stud: p.stud === true,
		stud_fee_three: Math.max(0, Number(p.stud_fee_three) || 0),
	};
}

// Can `callerUserId` use `row` as a breeding parent?
//   • own agent (breedable)           → free, allowed
//   • someone else's public stud       → allowed, may carry a $THREE stud fee
//   • anything else                    → denied
// Returns { allowed, reason, fee_three, cross_owner, owner_id }.
export function eligibilityFor(row, callerUserId) {
	const policy = breedingPolicy(row);
	const owned = row.user_id === callerUserId;
	if (owned) {
		if (!policy.breedable) return { allowed: false, reason: 'parent_not_breedable' };
		return { allowed: true, fee_three: 0, cross_owner: false, owner_id: row.user_id };
	}
	if (!row.is_public) return { allowed: false, reason: 'parent_private' };
	if (!policy.stud) return { allowed: false, reason: 'parent_not_listed_as_stud' };
	return { allowed: true, fee_three: policy.stud_fee_three, cross_owner: true, owner_id: row.user_id };
}

// Most-recent breeding timestamp for an agent as either parent. Null if never.
export async function lastBredAt(agentId) {
	const [row] = await sql`
		select max(created_at) as last
		from genome_breedings
		where (parent_a_agent_id = ${agentId} or parent_b_agent_id = ${agentId})
		  and status <> 'failed'
	`;
	return row?.last ? new Date(row.last) : null;
}

// Cooldown check against an injected `now` (testable, no Date.now in genome core).
export async function cooldownRemainingMs(agentId, now = Date.now()) {
	const last = await lastBredAt(agentId);
	if (!last) return 0;
	const remaining = BREED_COOLDOWN_MS - (now - last.getTime());
	return remaining > 0 ? remaining : 0;
}
