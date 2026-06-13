import { neon } from '@neondatabase/serverless';
import fetch from 'node-fetch';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL to your Neon connection string before running.');
	process.exit(1);
}
const sql = neon(DATABASE_URL);

async function main() {
	console.log('Fetching agents from nirholas/defi-agents...');
	const response = await fetch('https://nirholas.github.io/AI-Agents-Library/index.json');
	const { agents } = await response.json();
	console.log(`Found ${agents.length} agents.`);

	const [user] = await sql`
		SELECT id FROM users WHERE email = 'support@three.ws' LIMIT 1
	`;

	if (!user) {
		console.error('Seed user not found. Please run scripts/seed-agent.mjs first.');
		return;
	}

	console.log(`Seeding agents for user ${user.id}...`);

	for (const agent of agents) {
		const tags = agent.tags || [];
		// The description is sometimes in a 'summary' field.
		const description = agent.description || agent.summary || '';

		await sql`
			INSERT INTO agent_identities (
				user_id,
				name,
				description,
				system_prompt,
				category,
				tags,
				is_published,
				published_at
			)
			VALUES (
				${user.id},
				${agent.name},
				${description},
				${agent.system_prompt || ''},
				${tags[0] || 'general'},
				${tags},
				true,
				now()
			)
			ON CONFLICT (user_id, name) DO NOTHING;
		`;
		console.log(`- Seeded agent: ${agent.name}`);
	}

	console.log('Seeding complete.');
}

main().catch(console.error);
