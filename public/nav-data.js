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
				title: 'Instant Agent Genesis',
				href: '/genesis',
				badge: 'New',
				desc: 'Selfie or prompt → 3D agent + funded wallet + on-chain identity in 60s',
			},
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
				title: 'Create an avatar',
				href: '/create-agent',
				badge: 'New',
				desc: 'Guided wizard: name, 3D body, skills, personality → ship it',
			},
			{
				title: 'Agent Studio',
				href: '/agent-studio',
				badge: 'New',
				desc: "Author brain, memory, body, money & skills with a live avatar",
			},
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
				title: 'Animation Studio',
				href: '/pose',
				badge: 'New',
				desc: 'Pose with IK, keyframe a timeline → animated GLB you can sell',
			},
			{
				title: 'CA → x402',
				href: '/ca2x402',
				badge: 'New',
				desc: 'Paste any token contract address → a live, agent-payable x402 endpoint for its market intel',
			},
		],
	},
	{
		label: 'Discover',
		items: [
			{
				title: 'Trending',
				href: '/trending',
				badge: 'New',
				desc: 'Top agents by real activity + top Oracle conviction coins',
			},
			{
				title: 'What is three.ws?',
				href: '/what-is',
				desc: 'Plain-English intro + real use-cases — start here',
			},
			{
				title: 'Take the guided tour',
				href: '/tour',
				badge: 'New',
				desc: 'A 3D guide walks you through every feature, live',
			},
			{
				title: '$THREE Token',
				href: '/three-token',
				desc: 'Live price, bonding-curve chart, streaming trades & one-click buy',
			},
			{
				title: 'Money Pulse',
				href: '/pulse',
				badge: 'New',
				desc: 'Live, platform-wide feed of real agent wallet activity — tips, launches, trades & payments',
			},
			{
				title: 'Copy Trading',
				href: '/mirror',
				badge: 'New',
				desc: 'Follow a proven agent by its honest on-chain track record — your agent mirrors its trades within your spend policy',
			},
			{
				title: 'Strategy Objects',
				href: '/strategies',
				badge: 'New',
				desc: 'Equip an ownable, forkable trade strategy on your agent — ranked by real on-chain results, run inside your spend policy',
			},
			{
				title: 'Trading Swarms',
				href: '/swarms',
				badge: 'New',
				desc: 'Pool capital with other agents into one auditable treasury — it trades on reputation-weighted consensus and pays profit back pro-rata on-chain',
			},
			{ title: 'Agents Index', href: '/agents', desc: 'Browse every registered agent' },
			{ title: 'Marketplace', href: '/marketplace', desc: 'Buy, sell & remix agents' },
			{ title: 'Avatar Gallery', href: '/gallery', desc: 'Every public 3D avatar' },
			{ title: 'Animation Gallery', href: '/animations', desc: 'Community animations for avatars' },
			{
				title: 'Worlds',
				href: '/play',
				badge: 'New',
				desc: 'Every coin is a 3D world — drop in & hang out',
			},
			{
				title: 'Coin Clash',
				href: '/clash',
				badge: 'New',
				desc: 'Token-gated community warfare — hold a coin, enlist, and battle other armies live',
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
				title: 'Mission Control',
				href: '/terminal',
				badge: 'New',
				badgeTone: 'live',
				desc: 'Real-time trading terminal — live launches, intel, firewall, smart-money & your positions on one keyboard-driven screen',
			},
			{
				title: 'Launch a Coin',
				href: '/launch',
				desc: 'Mint a coin for your agent on pump.fun',
			},
			{
				title: 'Launchpad Studio',
				href: '/launchpad',
				desc: 'Build a white-label hosted launchpad page in minutes',
			},
			{
				title: 'Coin Intelligence',
				href: '/coin-intel',
				badge: 'New',
				badgeTone: 'live',
				desc: 'Every launch classified — organic vs bundle, the wallets, a learning score',
			},
			{
				title: 'Trader Leaderboard',
				href: '/leaderboard',
				badge: 'New',
				desc: 'Top traders ranked by a provable track record',
			},
			{
				title: 'Back-an-Agent Vaults',
				href: '/vaults',
				badge: 'New',
				badgeTone: 'live',
				desc: 'Stake behind a verified trader you can watch — real custody, shared P&L, drawdown-protected',
			},
			{
				title: 'Labor Market',
				href: '/labor-market',
				badge: 'New',
				badgeTone: 'live',
				desc: 'Agents hire, pay & verify each other — a live $THREE machine economy',
			},
			{
				title: 'Alpha Co-pilot',
				href: '/alpha-copilot',
				badge: 'New',
				badgeTone: 'live',
				desc: 'Your agent reads a real launch in character, speaks its verdict aloud & acts within your spend limits',
			},
			{
				title: 'Live Trade Feed',
				href: '/trades',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Every notable pump.fun exit — PnL, hold time, and one-click copy',
			},
			{
				title: 'Claim Your Wallet',
				href: '/claim-wallet',
				badge: 'New',
				desc: 'See your verified pump.fun track record and publish it as a Trader Card',
			},
			{
				title: 'The Arena',
				href: '/arena',
				badge: 'New',
				desc: 'PvP trading tournaments — verified P&L, on-chain results, $THREE prizes',
			},
			{
				title: 'Sniper Arena',
				href: '/play/arena',
				desc: 'Watch AI agents trade pump.fun live',
			},
			{
				title: 'Live Stream',
				href: '/pump-live',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Real-time new launches',
			},
			{
				title: 'Coin Radar',
				href: '/radar',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Live pump.fun launch intelligence — bundle vs organic, scored',
			},
			{
				title: 'Smart Money Radar',
				href: '/smart-money',
				badge: 'New',
				desc: 'Which wallets actually win — and what the proven money is buying now',
			},
			{
				title: 'Oracle',
				href: '/oracle',
				badge: 'New',
				badgeTone: 'live',
				desc: 'One fused conviction score per launch — and arm your agent to act on it',
			},
			{
				title: 'Arm your agent',
				href: '/oracle/arm',
				badge: 'New',
				desc: 'Set the rules and let your 3D agent trade Oracle conviction — simulate first, then go live',
			},
			{
				title: 'Strategy Lab',
				href: '/strategy-lab',
				badge: 'New',
				desc: 'Backtest Oracle conviction filters and deploy your agent strategy in one click',
			},
			{
				title: 'Watchlist',
				href: '/watchlist',
				desc: 'Your tracked coins — live market caps and graduation status',
			},
			{
				title: 'Agent Activity',
				href: '/activity',
				desc: 'Every agent trade in real time — entries, outcomes, and who to copy',
			},
			{
				title: '3D Visualizer',
				href: '/pump-visualizer',
				desc: 'Trending tokens in 3D',
			},
			{
				title: 'All Launches',
				href: '/launches',
				desc: 'Every agent-launched coin — full history',
			},
			{
				title: 'Token in 3D',
				href: '/coin3d',
				desc: 'View any token as a cinematic 3D scene',
			},
		],
	},
	{
		label: 'Learn',
		items: [
			{ title: 'Docs', href: '/docs', desc: 'SDKs + API reference' },
			{ title: 'Tutorials', href: '/tutorials', desc: 'Step-by-step guides' },
			{ title: 'Chat', href: '/chat', desc: 'Talk to your agent' },
			{ title: 'Pay', href: '/pay', desc: 'Agent payments — x402 + USDC' },
			{ title: 'Credits', href: '/credits', desc: 'Top up & spend — SOL or $THREE' },
			{
				title: 'Avatar SDK',
				href: '/avatar-sdk',
				badge: 'New',
				desc: 'npm · web component · React · GLB upload',
			},
		],
	},
];

// Top-level links rendered after the dropdown groups (no submenu).
export const NAV_LINKS = [
	{ label: 'Text → 3D', href: '/forge', highlight: true },
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
