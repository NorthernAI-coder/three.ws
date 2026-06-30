// @ts-check
// Shared GitHub → reward-destination resolution. Turns a GitHub identity into a
// concrete fee-share recipient so both the public resolve-github-shareholder
// endpoint and the launch use-case engine route creator rewards the same way.
//
// Three outcomes, mirroring pump.fun's social-fee model:
//   wallet      — the GitHub user is on three.ws (linked via GitHub OAuth) AND has
//                 a Solana payout wallet. Fully claimable via the distribute crank.
//   social_pda  — on three.ws but no wallet yet, or resolved by numeric id. Fees
//                 accrue in a pump.fun social-fee escrow; claim is brokered by
//                 pump.fun (we don't hold the social-claim authority).
//   unresolved  — not on three.ws and no numeric id to derive an escrow PDA.
//
// pump.fun keys social-fee PDAs by the NUMERIC GitHub user id (platform id 2),
// not the @login — see SOCIAL_PLATFORM_ID.

import { sql } from './db.js';

// pump.fun social platform ids (matches the SDK's Platform enum): Pump=0, X=1, GitHub=2.
export const SOCIAL_PLATFORM_ID = { pump: 0, x: 1, github: 2 };

/**
 * Resolve a GitHub identity to a reward destination.
 * @param {{ githubUsername?: string, githubUserId?: string, network?: 'mainnet'|'devnet' }} opts
 * @returns {Promise<{ mode:'wallet'|'social_pda'|'unresolved', address:string|null, github_username:string|null, github_user_id:string|null, claimable_now:boolean, note:string }>}
 */
export async function resolveGithubReward({ githubUsername, githubUserId, network = 'mainnet' } = {}) {
	const login = githubUsername ? String(githubUsername).replace(/^@/, '').trim() : null;
	const userId = githubUserId ? String(githubUserId).trim() : null;
	if (!login && !userId) {
		return {
			mode: 'unresolved', address: null, github_username: null, github_user_id: null,
			claimable_now: false, note: 'Provide a GitHub username or numeric user id.',
		};
	}

	// Look up the GitHub identity in social_connections (written by the GitHub
	// OAuth flow — provider_uid is the numeric GitHub user id).
	const [conn] = await sql`
		select user_id, provider_uid, username
		from social_connections
		where provider='github' and disconnected_at is null
		  and (${login}::text is not null and lower(username)=lower(${login})
		       or ${userId}::text is not null and provider_uid=${userId})
		order by connected_at desc
		limit 1
	`;

	const { socialFeePda } = await import('@pump-fun/pump-sdk');
	const platform = SOCIAL_PLATFORM_ID.github;

	if (conn) {
		// Prefer the recipient's primary linked Solana wallet — fully claimable.
		const [wallet] = await sql`
			select address from user_wallets
			where user_id=${conn.user_id} and chain_type='solana'
			order by is_primary desc, created_at asc
			limit 1
		`;
		if (wallet) {
			return {
				mode: 'wallet', address: wallet.address,
				github_username: conn.username, github_user_id: conn.provider_uid,
				claimable_now: true,
				note: 'Linked Solana payout wallet — pays out via the permissionless distribute crank.',
			};
		}
		return {
			mode: 'social_pda', address: socialFeePda(String(conn.provider_uid), platform).toBase58(),
			github_username: conn.username, github_user_id: conn.provider_uid,
			claimable_now: false,
			note: 'This GitHub user has no Solana payout wallet linked yet. Fees accrue in a pump.fun social-fee escrow; ask them to link a Solana wallet on three.ws to claim directly.',
		};
	}

	// Not on three.ws. We can only derive the escrow PDA from a numeric id —
	// pump.fun keys social-fee PDAs by the numeric GitHub user id, not the login.
	if (userId) {
		return {
			mode: 'social_pda', address: socialFeePda(String(userId), platform).toBase58(),
			github_username: login, github_user_id: userId, claimable_now: false,
			note: 'This GitHub user is not on three.ws. Fees accrue in a pump.fun social-fee escrow they can claim once they connect GitHub and link a Solana wallet.',
		};
	}
	return {
		mode: 'unresolved', address: null, github_username: login, github_user_id: null,
		claimable_now: false,
		note: 'No three.ws account found for that GitHub username. Provide the numeric GitHub user id to route into a pump.fun social-fee escrow, or ask them to sign in with GitHub and link a Solana wallet.',
	};
}
