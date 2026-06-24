// Agora narration — the single human-readable story line every economic action
// carries. The activity feed, the economy ticker, and the 3D world narration all
// render this one string (docs/agora.md). An activity with no story isn't worth
// recording, so the projection's `narrative` column is NOT NULL — these builders
// guarantee a real sentence for every kind.
//
// Pure module — no SDK / DB / network imports.

/** Format an atomic reward + mint label into a human chip, e.g. "0.0050 SOL" or "25,000 $THREE". */
export function rewardLabel({ amountAtomic, mint, decimals = 9 }) {
	if (amountAtomic == null) return null;
	let whole;
	try {
		const atomic = BigInt(amountAtomic);
		const base = 10n ** BigInt(decimals);
		const intPart = atomic / base;
		const frac = atomic % base;
		if (mint === '$THREE') {
			// $THREE is rendered as a whole-token count with grouping (no long decimals).
			whole = Number(atomic) / Number(base);
			const rounded = Math.round(whole);
			return `${rounded.toLocaleString('en-US')} $THREE`;
		}
		// Native SOL — 4 decimal places is the conventional precision.
		const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
		return `${intPart.toString()}.${fracStr} SOL`;
	} catch {
		return null;
	}
}

export function postedTaskNarrative({ poster, profession, reward, minReputation }) {
	const repClause = minReputation > 0 ? ` (needs reputation ${minReputation})` : '';
	const rewardClause = reward ? ` worth ${reward}` : '';
	return `${poster} posted a ${cap(profession)} bounty${rewardClause}${repClause}.`;
}

export function hiredNarrative({ poster, profession, reward, parentLabel }) {
	const forClause = parentLabel ? ` to help finish "${truncate(parentLabel, 48)}"` : '';
	const rewardClause = reward ? ` for ${reward}` : '';
	return `${poster} hired a ${cap(profession)}${forClause}${rewardClause}.`;
}

export function claimedNarrative({ worker, profession, poster }) {
	const fromClause = poster ? ` from ${poster}` : '';
	return `${worker} claimed a ${cap(profession)} job${fromClause} and got to work.`;
}

export function completedNarrative({ worker, profession, reward, repBefore, repAfter }) {
	const rewardClause = reward ? ` and earned ${reward}` : '';
	const repClause =
		repBefore != null && repAfter != null && repAfter !== repBefore
			? `; reputation ${repBefore} → ${repAfter}`
			: '';
	return `${worker} completed a ${cap(profession)} job${rewardClause}${repClause}.`;
}

export function earnedNarrative({ worker, reward }) {
	return `${worker} received ${reward || 'a reward'} from escrow.`;
}

export function registeredNarrative({ name, profession, cluster }) {
	return `${name} joined Agora as a ${cap(profession)} on ${cluster}.`;
}

export function reconcileNarrative({ poster, profession, verb }) {
	return `${poster}'s ${cap(profession)} bounty ${verb}.`;
}

function cap(s) {
	const t = String(s || 'worker');
	return t.charAt(0).toUpperCase() + t.slice(1);
}

function truncate(s, n) {
	const t = String(s || '');
	return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
