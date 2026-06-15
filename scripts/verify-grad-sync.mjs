// Temporary diagnostic for Task 08 — confirm the PumpPortal WS delivers
// migration (graduation) events on the same subscription the sync cron uses.
import WebSocket from 'ws';

const WS = 'wss://pumpportal.fun/api/data';
const WINDOW_MS = Number(process.env.WINDOW_MS || 180_000);
const counts = {};
let migrations = 0;

const ws = new WebSocket(WS);
ws.on('open', () => {
	console.log('[diag] open — subscribing to new tokens + migrations');
	ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
	ws.send(JSON.stringify({ method: 'subscribeMigration' }));
});
ws.on('message', (raw) => {
	let m;
	try { m = JSON.parse(raw.toString()); } catch { return; }
	if (m.message) { console.log('[diag] ack:', m.message); return; }
	const t = m.txType || 'unknown';
	counts[t] = (counts[t] || 0) + 1;
	if (t === 'migrate' || t === 'migration') {
		migrations++;
		console.log('[diag] MIGRATION:', m.mint, (m.signature || '').slice(0, 16));
	}
});
ws.on('error', (e) => console.log('[diag] error:', e.message));

setTimeout(() => {
	try { ws.close(); } catch {}
	console.log('[diag] txType counts over window:', JSON.stringify(counts));
	console.log('[diag] migrations observed:', migrations);
	process.exit(0);
}, WINDOW_MS);
