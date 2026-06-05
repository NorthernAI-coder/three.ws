#!/usr/bin/env node
// One-shot: inject the June 2026 items that aren't in items.json yet.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ITEMS_FILE = path.join(ROOT, 'data', 'rss', 'items.json');

const newItems = [
  {
    id: 'mcp-servers-x402-bazaar-coinbase',
    title: 'three.ws Ships Two New MCP Servers: x402 Bazaar + 3D Agent Avatar',
    date: '2026-06-03T12:00:00.000Z',
    link: 'https://x.com/trythreews',
    author: 'three.ws',
    summary: 'two new MCP servers are now live in Anthropic\'s official MCP Registry: the x402 Bazaar MCP (powered by Coinbase) lets agents discover, pay for, and call any x402 service in USDC settled on-chain; the 3D Avatar MCP lets any Claude or MCP client spawn a full browser-native 3D agent.',
    body_html: `<p><strong>two new MCP servers just shipped and are live in Anthropic's official MCP Registry.</strong></p>
<h2>x402 Bazaar MCP (powered by Coinbase)</h2>
<p>With the help of <a href="https://x.com/coinbase" rel="noopener">@Coinbase</a>, the x402 Bazaar MCP server lets your agents discover, pay for, and call any x402 service in USDC — settled on-chain. Any agent that can talk to an MCP server can now participate in the on-chain agent payments economy.</p>
<h2>3D Agent Avatar MCP</h2>
<p>The Avatar MCP gives Claude and any MCP-compatible client the ability to spawn a full browser-native 3D agent: on-chain identity, voice, memory, emotions, and a live x402 payment endpoint — all from a single tool call.</p>
<h2>Live in Anthropic's MCP Registry</h2>
<ul>
<li>Registry: <a href="https://registry.modelcontextprotocol.io/?q=threews" rel="noopener">registry.modelcontextprotocol.io/?q=threews</a></li>
<li>Open source: <a href="https://github.com/nirholas/three.ws" rel="noopener">github.com/nirholas/three.ws</a></li>
</ul>`,
    tags: ['mcp', 'x402', 'coinbase', 'anthropic', 'agent-payments', 'mcp-registry'],
  },
  {
    id: 'bybit-alpha-listing',
    title: '$three Listed on Bybit Alpha',
    date: '2026-06-03T10:00:00.000Z',
    link: 'https://x.com/Alpha_Bybit/status/2062417146370457844',
    author: 'three.ws',
    summary: '$three is now listed on Bybit Alpha — the dedicated launchpad for new and emerging assets on Bybit, one of the world\'s top three crypto exchanges.',
    body_html: `<p><strong>$three is now listed on Bybit Alpha</strong> — the dedicated discovery and trading surface for new and emerging assets on Bybit, one of the world's top three crypto exchanges by volume.</p>
<p>The listing makes $three tradeable by Bybit's global user base directly from the Bybit Alpha interface.</p>
<h2>About $three</h2>
<p>$three is the native token of the three.ws platform — browser-native 3D AI agents with on-chain identity, deployed anywhere on the web with a single <code>&lt;agent-3d&gt;</code> tag.</p>
<ul>
<li>CA: <code>FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump</code></li>
<li>Platform: <a href="https://three.ws" rel="noopener">three.ws</a></li>
<li>Open source: <a href="https://github.com/nirholas/three.ws" rel="noopener">github.com/nirholas/three.ws</a></li>
</ul>`,
    tags: ['listing', 'bybit', 'exchange', 'trading'],
  },
  {
    id: 'moonshot-verified',
    title: 'three.ws ($three) Is Now Verified on Moonshot',
    date: '2026-06-01T14:00:00.000Z',
    link: 'https://x.com/moonshot/status/2061468733734834350',
    author: 'three.ws',
    summary: 'three.ws ($three) is now verified on Moonshot, the leading Solana token discovery and trading platform.',
    body_html: `<p><strong>three.ws ($three) is now verified on Moonshot.</strong></p>
<p>Moonshot is one of the leading Solana token discovery and trading platforms, used by millions of traders to find and trade emerging Solana assets. The verification confirms the authenticity of the $three listing and gives the project a verified badge across Moonshot's interface.</p>
<h2>About $three</h2>
<p>$three is the native token of the three.ws platform — the open-source stack for browser-native 3D AI agents with on-chain identity.</p>
<ul>
<li>CA: <code>FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump</code></li>
<li>Platform: <a href="https://three.ws" rel="noopener">three.ws</a></li>
</ul>`,
    tags: ['listing', 'moonshot', 'solana', 'verified'],
  },
  {
    id: 'ibm-showcase-may31',
    title: 'three.ws Showcases IBM Partnership: Embedding a 3D Agent as Easily as a YouTube Video',
    date: '2026-05-31T12:00:00.000Z',
    link: 'https://x.com/trythreews',
    author: 'three.ws',
    summary: 'three.ws showcased the IBM partnership publicly: embedding a persistent, on-chain 3D avatar into any platform is now as easy as embedding a YouTube video — powered by IBM watsonx.ai and Granite, onboarding the next millions of developers and users.',
    body_html: `<p><strong>We're incredibly excited to showcase our partnership with <a href="https://x.com/IBM" rel="noopener">@IBM</a> and the true power of three.ws.</strong></p>
<p>We've made embedding a persistent, on-chain 3D avatar into any platform as easy as embedding a YouTube video.</p>
<ul>
<li><strong>Frictionless deployment</strong> — one <code>&lt;agent-3d&gt;</code> tag, any web page, any platform.</li>
<li><strong>IBM watsonx.ai brain</strong> — agents think on IBM Granite, running inside your own IBM Cloud account.</li>
<li><strong>On-chain identity</strong> — every agent is minted on Solana, owns its wallet, and can transact via x402.</li>
<li><strong>Enterprise scale</strong> — onboarding the next millions of developers and users to embodied AI.</li>
</ul>
<p>IBM's official account responded publicly: <em>"We're super excited about this."</em></p>
<h2>Related</h2>
<ul>
<li><a href="https://three.ws/blog/three-ws-ibm-collaboration">three.ws × IBM: Full Announcement</a></li>
<li><a href="https://three.ws" rel="noopener">three.ws</a></li>
</ul>`,
    tags: ['partnership', 'ibm', 'watsonx', 'agent-3d', 'enterprise'],
  },
  {
    id: 'threews-play-coin-communities',
    title: 'Introducing three.ws/play: Live 3D Virtual Townhalls for Any Coin',
    date: '2026-05-30T12:00:00.000Z',
    link: 'https://x.com/trythreews',
    author: 'three.ws',
    summary: 'three.ws/play launches as a live 3D virtual townhall for any pump.fun coin, powered by the CoinComms API & SDK. 100% multiplayer, custom 3D avatars, real-time on-chain events — the community is the asset, and now it has a home.',
    body_html: `<p><strong>Introducing <a href="https://three.ws/play" rel="noopener">three.ws/play</a></strong> — a live, 3D virtual townhall for ANY <a href="https://x.com/pumpfun" rel="noopener">@pumpfun</a> coin, powered by the brand new <a href="https://x.com/CoinComms" rel="noopener">@CoinComms</a> API &amp; SDK.</p>
<p>No more staring at charts in isolation.</p>
<ul>
<li><strong>Custom 3D Avatars.</strong> Build yours on three.ws and drop straight in.</li>
<li><strong>100% Multiplayer.</strong> Every holder in the same 3D space, in real time.</li>
<li><strong>On-chain events.</strong> Whale buys, graduation alerts, and price moves trigger live reactions from every avatar in the room.</li>
<li><strong>Voice + chat.</strong> Talk to your community directly in the 3D world.</li>
</ul>
<p>The community is the asset. Now it has a home.</p>
<h2>Try it</h2>
<ul>
<li><a href="https://three.ws/play" rel="noopener">three.ws/play</a></li>
<li>Open source: <a href="https://github.com/nirholas/three.ws" rel="noopener">github.com/nirholas/three.ws</a></li>
</ul>`,
    tags: ['play', 'multiplayer', 'coin-communities', 'pumpfun', '3d-world', 'colyseus'],
  },
  {
    id: 'cmc-memecoin-3d-world',
    title: 'CoinMarketCap: Every Memecoin Is Now a 3D World You Can Walk Into',
    date: '2026-05-30T10:00:00.000Z',
    link: 'https://coinmarketcap.com/community/articles/',
    author: 'three.ws',
    summary: '"Every Memecoin Is Now a 3D World You Can Walk Into" — three.ws guest post on CoinMarketCap. The community is the asset, so why does it live in a chat box? With three.ws/play, every coin gets a live 3D world its holders can walk into.',
    body_html: `<p><strong>"Every Memecoin Is Now a 3D World You Can Walk Into"</strong> — three.ws guest post on <a href="https://x.com/CoinMarketCap" rel="noopener">@CoinMarketCap</a>.</p>
<p>The community is the asset. So why does it live in a chat box?</p>
<p>With <a href="https://three.ws/play" rel="noopener">three.ws/play</a>, every pump.fun coin gets a live 3D world its holders can walk into — powered by the CoinComms API &amp; SDK. Real-time on-chain events trigger live avatar reactions. Whale buys, graduation alerts, price moves — all visible in 3D, together.</p>
<p>Read the full article on CoinMarketCap Community.</p>
<h2>Related</h2>
<ul>
<li><a href="https://three.ws/play" rel="noopener">three.ws/play</a></li>
<li><a href="https://three.ws" rel="noopener">three.ws</a></li>
</ul>`,
    tags: ['press', 'coinmarketcap', 'memecoin', 'play', '3d-world', 'coin-communities'],
  },
  {
    id: 'aws-builder-center-blog',
    title: 'three.ws Publishes on the AWS Builder Center Blog',
    date: '2026-05-30T08:00:00.000Z',
    link: 'https://three.ws/blog/three-ws-aws-partner.html',
    author: 'three.ws',
    summary: 'three.ws\'s contribution is live on the official AWS Builder Center Blog: "How we metered a SaaS product through AWS Marketplace with the AWS SDK for JavaScript v3" — covering ResolveCustomer, MeterUsage, entitlements, SNS lifecycle webhooks, and bridging to an on-chain x402 paywall.',
    body_html: `<p><strong>Our contribution just went live on the official AWS Builder Center Blog.</strong></p>
<h2>The article</h2>
<p><em>"How we metered a SaaS product through AWS Marketplace with the AWS SDK for JavaScript v3"</em></p>
<p>A technical deep-dive covering the full AWS Marketplace SaaS integration:</p>
<ul>
<li><strong>ResolveCustomer</strong> — validating the registration token on the fulfillment URL.</li>
<li><strong>MeterUsage / BatchMeterUsage</strong> — reporting per-agent and per-inference usage daily through AWS.</li>
<li><strong>GetEntitlements</strong> — checking contract entitlements for tiered feature gating.</li>
<li><strong>Verified SNS webhooks</strong> — handling <code>subscribe-success</code>, <code>unsubscribe-success</code>, and <code>entitlement-updated</code> lifecycle events with signature verification.</li>
<li><strong>Bridging to an on-chain x402 paywall</strong> — routing AWS subscription state into the three.ws x402 agent payment layer.</li>
</ul>
<p>All of it is open source at <a href="https://github.com/nirholas/three.ws/tree/main/api/aws-marketplace" rel="noopener">github.com/nirholas/three.ws/tree/main/api/aws-marketplace</a>.</p>
<h2>Related</h2>
<ul>
<li><a href="https://three.ws/blog/three-ws-on-aws-marketplace.html">three.ws Launches on AWS Marketplace</a></li>
<li><a href="https://three.ws/blog/three-ws-aws-partner.html">three.ws Joins the AWS Partner Network</a></li>
</ul>`,
    tags: ['aws', 'aws-marketplace', 'developer', 'x402', 'technical', 'blog'],
  },
  {
    id: 'aws-marketplace-live-may29',
    title: 'three.ws Is Now Officially Live on AWS Marketplace',
    date: '2026-05-29T12:00:00.000Z',
    link: 'https://three.ws/blog/three-ws-on-aws-marketplace.html',
    author: 'three.ws',
    summary: 'three.ws is now officially live on AWS Marketplace as an AWS Partner — delivering the open 3D layer for the internet. Embed fully embodied, browser-native 3D AI agents on any webpage. The first enterprise platform for on-chain 3D AI agents available through AWS.',
    body_html: `<p><strong>three.ws is now officially live on AWS Marketplace.</strong></p>
<p>As <a href="https://x.com/AWS_Partners" rel="noopener">@AWS_Partners</a>, we're delivering the open 3D layer for the internet: embed fully embodied, browser-native 3D AI agents on any webpage with a single <code>&lt;agent-3d&gt;</code> tag.</p>
<ul>
<li><strong>First enterprise platform</strong> for on-chain 3D AI agents available through AWS procurement.</li>
<li><strong>AWS invoice billing</strong> — no new vendor, no separate contract for AWS customers.</li>
<li><strong>AWS Activate credits apply</strong> — startup and enterprise credits count toward three.ws subscriptions.</li>
<li><strong>EDP commit toward</strong> — Marketplace spend counts toward Enterprise Discount Program commitments.</li>
</ul>
<h2>What you get</h2>
<p>A single <code>&lt;agent-3d&gt;</code> tag deploys a fully autonomous 3D agent with a Solana NFT identity, an ERC-8004 wallet, a Claude-powered LLM brain, and native x402 / HTTP 402 payments in USDC.</p>
<h2>Links</h2>
<ul>
<li>AWS Marketplace: <a href="https://three.ws/aws" rel="noopener">three.ws/aws</a></li>
<li>Open source: <a href="https://github.com/nirholas/three.ws" rel="noopener">github.com/nirholas/three.ws</a></li>
</ul>`,
    tags: ['listing', 'marketplace', 'aws', 'aws-marketplace', 'enterprise', 'agent-3d'],
  },
  {
    id: 'cmc-mcp-registry-article',
    title: 'three.ws Brings Autonomous Payments and 3D Generation to Anthropic\'s Official MCP Registry',
    date: '2026-06-05T05:00:00.000Z',
    link: 'https://coinmarketcap.com/community/articles/6a226647c17eac2629024fc8/',
    author: 'three.ws',
    summary: 'CoinMarketCap article: three.ws brings autonomous payments and 3D generation to Anthropic\'s official MCP Registry — two new MCP servers give Claude and any MCP client the ability to spawn 3D agents and make on-chain x402 payments via the Coinbase-powered x402 Bazaar.',
    body_html: `<p><strong>"three.ws Brings Autonomous Payments and 3D Generation to Anthropic's Official MCP Registry"</strong> — published on <a href="https://x.com/CoinMarketCap" rel="noopener">@CoinMarketCap</a>.</p>
<p>Read the full article: <a href="https://coinmarketcap.com/community/articles/6a226647c17eac2629024fc8/" rel="noopener">coinmarketcap.com/community/articles/6a226647c17eac2629024fc8/</a></p>
<h2>What's covered</h2>
<ul>
<li><strong>x402 Bazaar MCP</strong> — powered by Coinbase, gives any Claude or MCP client the ability to discover, pay for, and call any x402 service in USDC, settled on-chain.</li>
<li><strong>3D Agent Avatar MCP</strong> — lets any MCP client spawn a browser-native 3D agent with on-chain identity, voice, memory, and a live payment endpoint.</li>
<li><strong>Anthropic MCP Registry listing</strong> — both servers are live in the canonical directory used by Claude, Cursor, and all MCP-compatible clients.</li>
</ul>
<h2>Related</h2>
<ul>
<li><a href="https://registry.modelcontextprotocol.io/?q=threews" rel="noopener">registry.modelcontextprotocol.io/?q=threews</a></li>
<li><a href="https://three.ws" rel="noopener">three.ws</a></li>
</ul>`,
    tags: ['press', 'coinmarketcap', 'mcp', 'x402', 'coinbase', 'anthropic', 'mcp-registry'],
  },
];

const existing = JSON.parse(await readFile(ITEMS_FILE, 'utf8'));
const existingIds = new Set(existing.items.map((i) => i.id));

const toAdd = newItems.filter((i) => !existingIds.has(i.id));
console.log(`Adding ${toAdd.length} new items (${newItems.length - toAdd.length} already present)`);

const merged = [...existing.items, ...toAdd].sort(
  (a, b) => new Date(b.date) - new Date(a.date),
);

const out = {
  ...existing,
  _readme: existing._readme.replace(/\(\d+ total items.*?\)/, `(${merged.length} total items, merged June 2026 posts)`),
  items: merged,
};

await writeFile(ITEMS_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Wrote ${merged.length} total items`);
