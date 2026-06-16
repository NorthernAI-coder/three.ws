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
				title: 'Selfie to avatar',
				href: '/create/selfie',
				desc: 'One photo → rigged 3D avatar',
			},
			{
				title: 'Avatar Studio',
				href: '/avatar-studio',
				desc: 'Sculpt face + body from scratch → export GLB',
			},
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
			{ title: 'Agents Index', href: '/agents', desc: 'Browse every registered agent' },
			{ title: 'Marketplace', href: '/marketplace', desc: 'Buy, sell & remix agents' },
			{ title: 'Avatar Gallery', href: '/gallery', desc: 'Every public 3D avatar' },
			{
				title: 'Worlds',
				href: '/play',
				badge: 'New',
				desc: 'Every coin is a 3D world — drop in & hang out',
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
				href: '/launch',
				desc: 'Mint a coin for your agent on pump.fun',
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
				title: 'Live Trade Feed',
				href: '/trades',
				badge: 'Live',
				badgeTone: 'live',
				desc: 'Every notable pump.fun exit — PnL, hold time, and one-click copy',
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
		],
	},
	{
		label: 'Learn',
		items: [
			{ title: 'Docs', href: '/docs', desc: 'SDKs + API reference' },
			{ title: 'Tutorials', href: '/tutorials', desc: 'Step-by-step guides' },
			{ title: 'Chat', href: '/chat', desc: 'Talk to your agent' },
			{ title: 'Pay', href: '/pay', desc: 'Agent payments — x402 + USDC' },
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
