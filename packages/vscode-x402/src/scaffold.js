// Scaffold a new paid x402 endpoint. Generates a self-contained Express server
// that puts an x402 paywall in front of a route using the standard `x402-express`
// middleware, then opens it. The output is framework-neutral and runs anywhere —
// no platform-specific helpers, no monorepo imports.

import * as vscode from 'vscode';

function template({ slug, priceUsd, description, network, payTo, resourceUrl }) {
	const price = Number(priceUsd).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
	return `// ${slug} — paid x402 endpoint.
//
// Buyers pay USDC; the handler runs only after the payment settles. The paywall
// is provided by the standard \`x402-express\` middleware, so this works with any
// x402-compatible client (including this VS Code extension's "Pay & call").
//
//   POST /x402/${slug}
//
// Install:   npm i express x402-express
// Run:       PAY_TO=0xYourReceivingAddress node ${slug}.js
//
// Required env:
//   PAY_TO   EVM address that receives the USDC payments.

import express from 'express';
import { paymentMiddleware } from 'x402-express';

const PORT = Number(process.env.PORT || 4021);
const NETWORK = process.env.X402_NETWORK || ${JSON.stringify(network)};
const PAY_TO = process.env.PAY_TO || ${JSON.stringify(payTo)};

if (!PAY_TO || PAY_TO.startsWith('0xYour')) {
	throw new Error('Set PAY_TO to the EVM address that should receive payments.');
}

const app = express();
app.use(express.json());

// Put a paywall in front of POST /x402/${slug}. The middleware answers an
// unpaid request with a real 402 challenge and only calls the route once the
// buyer's USDC payment is verified/settled.
app.use(
	paymentMiddleware(
		PAY_TO,
		{
			'POST /x402/${slug}': {
				price: '$${price}',
				network: NETWORK,
				config: {
					description: ${JSON.stringify(description)},
					// Where buyers can read about this resource.
					resource: ${JSON.stringify(resourceUrl)},
				},
			},
		},
		// Optional: pass a facilitator URL here to settle on a hosted facilitator.
	),
);

app.post('/x402/${slug}', (req, res) => {
	// Runs ONLY after the buyer's USDC payment settles. Replace this echo with
	// the real work; it returns the validated request so the endpoint is wired
	// end-to-end from the first run.
	res.json({
		ok: true,
		service: ${JSON.stringify(slug)},
		received: req.body ?? null,
	});
});

app.listen(PORT, () => {
	console.log('${slug} paid endpoint listening on http://localhost:' + PORT + '/x402/${slug}');
});
`;
}

export async function scaffoldEndpoint() {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders?.length) {
		vscode.window.showErrorMessage('Open a workspace folder to scaffold an endpoint into.');
		return;
	}

	const slug = await vscode.window.showInputBox({
		title: 'Scaffold paid endpoint — slug',
		prompt: 'URL slug, e.g. "summarize" → /x402/summarize',
		validateInput: (v) =>
			/^[a-z0-9][a-z0-9-]*$/.test((v || '').trim()) ? null : 'lowercase letters, digits, hyphens',
	});
	if (!slug) return;

	const priceUsd = await vscode.window.showInputBox({
		title: 'Price per call (USD)',
		value: '0.01',
		validateInput: (v) => (Number(v) > 0 ? null : 'must be a positive number'),
	});
	if (!priceUsd) return;

	const description = await vscode.window.showInputBox({
		title: 'Description',
		prompt: 'What does this endpoint do? (shown to buyers)',
		value: `${slug} service`,
	});
	if (description == null) return;

	const cfg = vscode.workspace.getConfiguration('x402');
	const network = networkSlug(cfg.get('network', 'eip155:8453'));

	const cleanSlug = slug.trim();
	const content = template({
		slug: cleanSlug,
		priceUsd,
		description,
		network,
		payTo: '0xYourReceivingAddress',
		resourceUrl: `https://your-api.example.com/x402/${cleanSlug}`,
	});

	const root = folders[0].uri;
	const target = vscode.Uri.joinPath(root, `${cleanSlug}.js`);
	try {
		await vscode.workspace.fs.stat(target);
		const ow = await vscode.window.showWarningMessage(
			`${cleanSlug}.js already exists. Overwrite?`,
			'Overwrite',
			'Cancel',
		);
		if (ow !== 'Overwrite') return;
	} catch {
		/* doesn't exist — good */
	}

	await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
	const doc = await vscode.workspace.openTextDocument(target);
	await vscode.window.showTextDocument(doc);
	vscode.window.showInformationMessage(
		`Scaffolded /x402/${cleanSlug} (${cleanSlug}.js). Run "npm i express x402-express", set PAY_TO, then "node ${cleanSlug}.js".`,
	);
}

// Map a CAIP-2 id to the x402 network slug used by x402-express. Defaults to
// "base" for anything unrecognised so the scaffold stays runnable.
function networkSlug(caip2) {
	const map = {
		'eip155:8453': 'base',
		'eip155:84532': 'base-sepolia',
		'eip155:43114': 'avalanche',
		'eip155:43113': 'avalanche-fuji',
	};
	return map[String(caip2 || '').trim()] || 'base';
}
