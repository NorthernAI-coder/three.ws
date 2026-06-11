// One-off: append metamask-agent-wallet + metamask-agent-workflows to
// data/skills/seed.json from their committed SKILL.md sources.
// Run: node scripts/add-metamask-seed-entries.mjs   (idempotent; delete after use)

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(root, 'data/skills/seed.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

function parseSkill(dir) {
	const src = readFileSync(resolve(root, 'data/skills', dir, 'SKILL.md'), 'utf8');
	const end = src.indexOf('\n---', 4);
	const fm = src.slice(4, end);
	const body = src.slice(end + 4).replace(/^\n+/, '');
	const name = fm.match(/^name:\s*(.+)$/m)[1].trim();
	const description = fm.match(/^description:\s*(.+)$/m)[1].trim();
	const version = (fm.match(/version:\s*"?([\d.]+)"?/) || [])[1] || '1.0.0';
	return { name, description, version, body };
}

const TAGS = {
	'metamask-agent-wallet': ['wallet', 'metamask', 'evm', 'swap', 'bridge', 'perps', 'prediction-markets', 'aave'],
	'metamask-agent-workflows': ['wallet', 'metamask', 'workflows', 'onboarding', 'swap', 'bridge'],
};

const FOOTER = [
	'',
	'## Get the full skill pack',
	'',
	'This skill ships with per-command reference files and step-by-step workflow templates.',
	'Install the complete pack into your own agent (Claude Code, Codex, Cursor, or similar):',
	'',
	'```',
	'npm install -g @metamask/agentic-cli',
	'npx skills add MetaMask/agent-skills',
	'```',
	'',
	'Then run `mm login` and `mm init` to provision your own agent wallet. Each user',
	'authenticates their own MetaMask Agent Wallet — keys are never shared or custodied',
	'by three.ws.',
	'',
].join('\n');

let added = 0;
for (const dir of ['metamask-agent-wallet', 'metamask-agent-workflows']) {
	if (seed.skills.some((s) => s.identifier === dir)) continue;
	const { name, description, version, body } = parseSkill(dir);
	seed.skills.push({
		category: 'wallet',
		content: body + FOOTER,
		description,
		identifier: dir,
		manifest: {
			name,
			description,
			license: 'MIT',
			metadata: {
				author: 'metamask',
				version,
				category: 'wallet',
				difficulty: 'intermediate',
				tags: TAGS[dir],
			},
		},
	});
	added++;
}

writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
console.log(`added ${added} entries — seed.json now has ${seed.skills.length} skills`);
