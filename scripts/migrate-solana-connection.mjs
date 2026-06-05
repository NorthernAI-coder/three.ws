// One-shot codemod: migrate raw `new Connection(url, commitment)` call sites to
// the failover-aware `solanaConnection({ url, commitment })`. Network (mainnet/
// devnet) is inferred from the resolved url inside the engine, so call sites need
// no change beyond the constructor. Run once, then delete (repo hygiene).
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname } from 'node:path';

const ENGINE = 'api/_lib/solana/connection.js';

const FILES = [
	'api/x402-checkout.js',
	'api/x402-pay.js',
	'api/portfolio/[action].js',
	'api/payments/prepare-skill-purchase.js',
	'api/payments/solana/[action].js',
	'api/rider/check.js',
	'api/nft/mint-scene-confirm.js',
	'api/_lib/pump.js',
	'api/_lib/attest-event.js',
	'api/_lib/x402-user-payer.js',
	'api/_lib/agent-pumpfun.js',
	'api/_lib/token/payments.js',
	'api/_lib/club/payouts.js',
	'api/agents/tokens/[action].js',
	'api/agents/payments/[action].js',
	'api/agents/solana/_handlers.js',
	'api/agents/onchain/[action].js',
	'api/tx/solana/[action].js',
	'api/_lib/threews-sns.js',
	'api/_lib/avatar-wallet.js',
	'api/marketplace/purchase-as-agent.js',
	'api/_lib/solana-attestations.js',
	'api/_lib/solana-wallet.js',
	'api/_lib/solana-transfer.js',
	'api/purchase/skill.js',
	'api/actions/avatar.js',
];

// `new Connection(<expr>, <commitment>)` on a single line. <expr> is non-greedy;
// <commitment> is a quoted literal or a bare identifier.
const RE = /new Connection\((.+?),\s*('[a-z]+'|[A-Za-z_$][\w$]*)\)/g;

function importPath(file) {
	let p = relative(dirname(file), ENGINE).replace(/\\/g, '/');
	if (!p.startsWith('.')) p = './' + p;
	return p;
}

let total = 0;
for (const file of FILES) {
	let src = readFileSync(file, 'utf8');
	const lines = src.split('\n');
	let count = 0;
	const out = lines.map((line) => {
		const trimmed = line.trimStart();
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) return line; // skip comments
		return line.replace(RE, (_m, expr, commitment) => {
			count++;
			return `solanaConnection({ url: ${expr}, commitment: ${commitment} })`;
		});
	});
	if (count === 0) {
		console.log(`-- ${file}: no match`);
		continue;
	}
	src = out.join('\n');

	// Insert the import once, right after the @solana/web3.js import if present,
	// else after the first import statement.
	if (!src.includes("solana/connection.js'") && !src.includes('solanaConnection }')) {
		const imp = `import { solanaConnection } from '${importPath(file)}';`;
		const srcLines = src.split('\n');
		let idx = srcLines.findIndex((l) => /@solana\/web3\.js'/.test(l) && l.startsWith('import'));
		if (idx === -1) idx = srcLines.findIndex((l) => l.startsWith('import '));
		srcLines.splice(idx + 1, 0, imp);
		src = srcLines.join('\n');
	}
	writeFileSync(file, src);
	total += count;
	console.log(`✓ ${file}: ${count} call(s)`);
}
console.log(`\nTotal: ${total} call sites migrated`);
