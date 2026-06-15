// three.ws site navigation — the single source of truth for every menu.
//
// Consumed by:
//   - public/nav.js                    renders the desktop dropdowns and the
//                                      mobile drawer from this data at runtime
//   - chat/src/three-ui/TopNav.svelte  chat header's main-site links
//
// Edit menus HERE and only here. Never hand-write menu markup in nav.html or
// a page header — that is exactly the drift this module exists to kill.
//
// Shapes:
//   group: { label, badge?, note?, layout?: 'wide' | 'mega',
//            items?: item[], columns?: { label, items: item[] }[] }
//     - default layout: single-column dropdown of `items`
//     - 'wide': two-column dropdown of `items`
//     - 'mega': right-anchored three-column dropdown of named `columns`
//   item:  { title, href, desc, badge?, badgeTone?, attrs? }
//     - badgeTone: 'live' tints the badge green with a pulse dot (running now)
//     - attrs: extra HTML attributes, e.g. { 'data-glossary-open': '' }
//   top-level link: { label, href, highlight? }
//     - highlight: renders as the iridescent "hot" pill (one per nav, max)

export const NAV_GROUPS = [
	{
		label: 'Build',
		items: [
			{
				title: 'Text to 3D',
				href: '/forge',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Describe an object → textured GLB, usually in seconds',
			},
			{
				title: 'Describe it to 3D',
				href: '/create/prompt',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Type a description → rigged 3D avatar in about a minute',
			},
			{
				title: 'Create an agent',
				href: '/create-agent',
				badge: 'New',
				desc: 'Guided wizard: name, 3D body, skills, personality → ship it',
			},
			{
				title: 'Vanity wallet',
				href: '/vanity-wallet',
				badge: 'New',
				desc: 'Grind a custom Solana address — prefix, suffix, or both',
			},
			{
				title: 'Worlds',
				href: '/play',
				badge: 'New',
				desc: 'Every coin is a 3D world — drop in & hang out',
			},
			{
				title: 'Sniper Arena',
				href: '/play/arena',
				badge: 'New',
				desc: 'Watch AI agents trade pump.fun live — on-chain P&L leaderboard',
			},
			{ title: 'Create avatar', href: '/create', desc: 'Pick or upload a 3D body' },
			{
				title: 'Selfie to avatar',
				href: '/create/selfie',
				desc: 'One photo → rigged 3D avatar',
			},
			{
				title: 'Avatar Studio',
				href: '/avatar-studio',
				desc: 'Sculpt face + body from scratch → export GLB',
			},
			{
				title: 'Scene Studio',
				href: '/scene',
				desc: 'Assemble models into full 3D scenes',
			},
			{
				title: 'Scene Composer',
				href: '/compose',
				badge: 'New',
				desc: 'Forge items & dress your avatar in real time',
			},
			{
				title: 'Voice Lab',
				href: '/voice',
				badge: 'New',
				desc: 'Clone your voice · TTS playground',
			},
			{ title: 'Pose Studio', href: '/pose', desc: 'Click-to-pose mannequin + export PNG' },
			{ title: 'Viewer', href: '/app', desc: 'Drag-and-drop GLB' },
			{
				title: 'Playground',
				href: '/playground',
				desc: 'Viewer + environment + embed code',
			},
			{ title: 'glTF Validator', href: '/validation', desc: 'Khronos spec check' },
		],
	},
	{
		label: 'Discover',
		items: [
			{
				title: 'What is three.ws?',
				href: '/what-is',
				desc: 'Plain-English intro + real use-cases — start here',
			},
			{
				title: 'Features',
				href: '/features',
				desc: 'Everything an agent gets — interactive tour',
			},
			{ title: 'ERC-8004 Agents', href: '/discover', desc: 'On-chain agent directory' },
			{ title: 'Agents Index', href: '/agents', desc: 'Browse every registered agent' },
			{
				title: 'Agent Launches',
				href: '/launches',
				badge: 'New',
				desc: 'Every coin launched by an agent — live public feed',
			},
			{
				title: 'Reputation Explorer',
				href: '/reputation',
				desc: 'On-chain scores & attestations',
			},
			{ title: 'Marketplace', href: '/marketplace', desc: 'Buy, sell & remix agents' },
			{ title: 'Avatar Gallery', href: '/gallery', desc: 'Every public 3D avatar' },
			{
				title: 'Skills',
				href: '/skills',
				badge: 'New',
				desc: 'Browse agent tool packs & capabilities',
			},
			{ title: 'x402 Bazaar', href: '/bazaar', desc: 'Browse paid APIs and MCP tools' },
			{
				title: 'Community',
				href: '/community',
				desc: 'X, GitHub, and ways to get involved',
			},
			{
				title: 'Labs',
				href: '/labs',
				badge: 'New',
				desc: 'Hidden gems — fact-checker, tutor, lipsync & more',
			},
			{
				title: 'All pages',
				href: '/sitemap',
				desc: 'The full directory — every page on three.ws, filterable',
			},
		],
	},
	{
		label: 'Launch',
		items: [
			{
				title: 'Launch a Coin',
				href: '/launchpad',
				desc: 'Create a token for your agent',
			},
			{
				title: 'All Launches',
				href: '/launches',
				badge: 'New',
				desc: 'Public feed of every agent coin',
			},
			{
				title: 'Live Stream',
				href: '/pump-live',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Real-time new launches',
			},
			{
				title: '3D Visualizer',
				href: '/pump-visualizer',
				desc: 'Trending tokens in 3D',
			},
			{
				title: 'Token in 3D',
				href: '/coin3d',
				desc: 'View any token as a 3D scene',
			},
		],
	},
	{
		label: 'Embed',
		items: [
			{ title: 'Widgets', href: '/widgets', desc: 'Browse + customize embeddable widgets' },
			{ title: 'Widget Studio', href: '/studio', desc: 'Pick avatar → copy snippet' },
			{ title: 'Embed editor', href: '/embed.html', desc: 'Tune mode, size, position' },
			{
				title: 'Avatar SDK',
				href: '/avatar-sdk',
				badge: 'New',
				desc: 'npm · web component · React · GLB upload',
			},
			{ title: 'Embed docs', href: '/docs#embedding', desc: 'iframe + oEmbed' },
			{ title: '<agent-3d>', href: '/docs#web-component', desc: 'Web component reference' },
		],
	},
	{
		label: 'Learn',
		items: [
			{ title: 'Docs', href: '/docs', desc: 'SDKs + API reference' },
			{ title: 'Tutorials', href: '/tutorials', desc: 'Step-by-step guides' },
			{
				title: 'Brain',
				href: '/brain',
				badge: 'New',
				desc: 'Claude · GPT · DeepSeek · Qwen · Llama',
			},
			{ title: 'Chat', href: '/chat', desc: 'Talk to your agent' },
			{ title: 'Pay', href: '/pay', desc: 'Agent payments — x402 + USDC' },
			{ title: 'Solana SDK', href: '/docs#solana', desc: 'Attestations + agent-kit' },
			{
				title: 'Glossary',
				href: '#',
				desc: 'Plain-English definitions for crypto terms',
				attrs: { 'data-glossary-open': '' },
			},
		],
	},
	{
		label: 'Integrations',
		layout: 'wide',
		note: 'Live partner showcases — built on real platforms, running end-to-end.',
		items: [
			{
				title: 'AWS Marketplace',
				href: '/aws',
				desc: 'three.ws as an AWS Partner listing',
			},
		],
	},
	{
		label: 'Labs',
		badge: 'Beta',
		layout: 'mega',
		note: 'Experimental features — actively iterating. Expect rough edges.',
		columns: [
			{
				label: 'Avatar & Motion',
				items: [
					{ title: 'Lipsync', href: '/lipsync', desc: 'TTS or mic → in-browser viseme → mouth' },
					{ title: 'Mocap Studio', href: '/mocap-studio', desc: 'Record face → save clip → replay' },
					{ title: 'OBS Overlay', href: '/overlay-control', desc: 'Stream deck — emote hotkeys, mic' },
					{ title: 'Walk', href: '/walk', desc: 'Walk your avatar — multiplayer + AR' },
					{ title: 'IRL', href: '/irl', desc: 'AR camera + joystick + tap-to-place objects' },
					{ title: 'XR', href: '/xr', desc: 'Place your avatar in the real world' },
				],
			},
			{
				label: 'Markets & Pump',
				items: [
					{
						title: 'Launchpad Studio',
						href: '/launchpad',
						desc: 'Build a 3D launchpad · token · concierge',
					},
					{ title: 'GMGN Smart Money', href: '/gmgn', desc: 'Agent narrates smart wallet signals' },
					{ title: 'Pump.fun stream', href: '/pumpfun', desc: 'Mint agent tokens' },
					{ title: 'Live launches', href: '/pump-live', desc: 'Real-time launch feed' },
					{ title: 'Pump Dashboard', href: '/pump-dashboard', desc: 'Watches · scanner · quotes' },
					{ title: 'Pump Visualizer', href: '/pump-visualizer', desc: '3D view of trending tokens' },
					{
						title: '$THREE Live',
						href: '/three-live',
						badge: 'New',
						desc: 'Protocol pulse — live trades in 3D',
					},
					{ title: 'Strategy Lab', href: '/strategy-lab', desc: 'DCA + subscriptions' },
				],
			},
			{
				label: 'x402 & Onchain',
				items: [
					{
						title: 'Agent Wallet',
						href: '/play/agent-wallet',
						badge: 'New',
						desc: 'Your avatar pays an endpoint with its agent wallet — USDC on Solana',
					},
					{ title: 'Pole Club', href: '/club', desc: 'x402 micro-tip demo — $0.001 / dance' },
					{
						title: 'Endpoint Shopper',
						href: '/shopper',
						desc: 'AI chains x402 endpoints to answer a task',
					},
					{
						title: 'Pay-As-You-Learn Tutor',
						href: '/tutor',
						desc: '$0.01 per answer in USDC over x402',
					},
					{
						title: 'Fact Checker',
						href: '/fact-checker',
						desc: '$0.10 per claim — cited verdict + attestation',
					},
					{ title: 'API Arbitrage', href: '/arbitrage', desc: 'Cheapest endpoint per capability, live' },
					{
						title: 'API Providers',
						href: '/providers',
						desc: 'Operator profiles for the paid API catalog',
					},
					{
						title: 'Unstoppable Agent',
						href: '/unstoppable',
						desc: 'Self-funding agent dashboard, live',
					},
					{ title: 'Forever', href: '/forever', desc: 'Etch a message into Bitcoin — forever' },
					{ title: 'EVM vanity wallet', href: '/evm-wallet', desc: 'Grind an Ethereum / EVM address' },
					{ title: 'ETH vanity (CREATE2)', href: '/eth-vanity', desc: 'Grind a smart-contract address' },
				],
			},
		],
	},
];

// Top-level links rendered after the dropdown groups (no submenu).
export const NAV_LINKS = [
	{ label: 'Text → 3D', href: '/forge', highlight: true },
	{ label: 'Pricing', href: '/pricing' },
];

// Footer-of-drawer links that have no desktop dropdown home.
export const DRAWER_LEGAL = [
	{ title: 'Privacy Policy', href: '/legal/privacy' },
	{ title: 'Terms of Use', href: '/legal/tos' },
];

// The chat SPA header shows a compact subset of main-site destinations.
// Kept here so chat and the main nav can never disagree on labels or hrefs.
export const CHAT_SITE_LINKS = [
	{ label: 'Text → 3D', href: '/forge', highlight: true },
	{ label: 'Marketplace', href: '/marketplace' },
	{ label: 'Pay', href: '/pay' },
	{ label: 'Features', href: '/features' },
	{ label: 'Docs', href: '/docs' },
];
