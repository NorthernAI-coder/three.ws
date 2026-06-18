// Reproduce the chat assistant-message layout (avatar + reasoning + tool pills + split-view inspector)
// via a share link, then screenshot + dump layout metrics. Used to verify the layout fix.
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';

const BASE = process.env.CHAT_URL || 'http://localhost:5173/chat/';

function b64url(buf) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const model = { id: 'nex-n2-pro', name: 'Nex-N2-Pro', provider: 'three.ws' };

const tc = (name, args) => ({ id: 'tc-' + Math.random().toString(36).slice(2), name, arguments: args, finished: true });

const forgeAvatarArgs = {
	name: 'Cyberpunk Trader',
	prompt:
		'A cyberpunk trader character, full body, neon jacket, holographic trading visor, futuristic streetwear, confident pose, dark city lighting, 3D stylized',
	save: 'true',
};

const messages = [
	{ id: 'u1', role: 'user', content: 'Give me 3 crypto avatar ideas', submitted: true },
	{
		id: 'a1',
		role: 'assistant',
		model,
		content:
			'Here are three directions worth exploring:\n\n- **Solana-themed avatar**\n- **Pump.fun frog mascot**\n- **Crypto robot**',
	},
	{ id: 'u2', role: 'user', content: 'do 1 of each', submitted: true },
	{
		id: 'a2',
		role: 'assistant',
		model,
		content: '',
		reasoning: true,
		thinking: false,
		thinkingTime: 31,
		thoughts:
			'The user wants one of each idea. I will forge a Solana-themed avatar, a pump.fun frog mascot, and a crypto robot, then a cyberpunk trader for good measure.',
		toolcalls: [
			tc('ForgeTextTo3D', { prompt: 'A Solana-themed avatar, glowing teal and purple, 3D stylized', save: 'true' }),
			tc('ForgeAvatar', { name: 'Frog Mascot', prompt: 'A pump.fun frog mascot, cute, big eyes, 3D stylized', save: 'true' }),
			tc('ForgeAvatar', { name: 'Crypto Robot', prompt: 'A friendly crypto robot, chrome body, LED eyes, 3D stylized', save: 'true' }),
			tc('ForgeAvatar', { name: 'Neon Punk', prompt: 'A neon punk avatar, mohawk, jacket, 3D stylized', save: 'true' }),
			tc('ForgeAvatar', forgeAvatarArgs),
			tc('ForgeTextTo3D', { prompt: 'A crypto robot statue, marble, 3D stylized', save: 'true' }),
		],
	},
];

const convo = { name: 'Crypto avatars', models: [model], messages };
const share = b64url(gzipSync(Buffer.from(JSON.stringify(convo), 'utf8')));
const url = `${BASE}?s=${share}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.addInitScript(() => {
	localStorage.setItem('localAgentId', JSON.stringify('demo-agent'));
	localStorage.setItem('talkingHeadAvatarUrl', JSON.stringify('/avatars/cz.glb'));
	localStorage.setItem('config', JSON.stringify({ explicitToolView: false, messageAnimation: 'snap' }));
});

page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('li[data-role="assistant"]', { timeout: 20000 });
// open the active toolcall (ForgeAvatar Cyberpunk Trader = 5th pill) to engage split view
await page.waitForSelector('button[data-trigger="toolcall"]', { timeout: 20000 });
const pills = await page.$$('button[data-trigger="toolcall"]');
if (pills[4]) await pills[4].click();
// let the avatar walk-in / load settle
await page.waitForTimeout(7000);

const metrics = await page.evaluate(() => {
	const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
	const lastAssistant = [...document.querySelectorAll('li[data-role="assistant"]')].pop();
	const slot = lastAssistant?.querySelector('agent-3d')?.parentElement;
	const contentCol = lastAssistant?.querySelector('.flex.w-full.flex-col');
	const pillWrap = [...(lastAssistant?.querySelectorAll('div') || [])].find((d) => d.querySelector('button[data-trigger="toolcall"]'));
	const pills = [...(lastAssistant?.querySelectorAll('button[data-trigger="toolcall"]') || [])].map((p) => r(p));
	const rows = new Set(pills.map((p) => p && p.y));
	return {
		viewport: { w: window.innerWidth, h: window.innerHeight },
		splitView: !!document.querySelector('.scrollable')?.parentElement?.className?.includes('w-[50%]'),
		assistantRow: r(lastAssistant),
		avatarSlot: r(slot),
		contentCol: r(contentCol),
		pillWrap: r(pillWrap),
		pillRows: rows.size,
		pillCount: pills.length,
	};
});
console.log(JSON.stringify(metrics, null, 2));

await page.screenshot({ path: '/tmp/chat-layout.png', fullPage: false });
console.log('screenshot -> /tmp/chat-layout.png');
await browser.close();
