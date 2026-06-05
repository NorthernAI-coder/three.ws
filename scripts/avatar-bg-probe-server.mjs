import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
	'.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
	'.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
};

http.createServer((req, res) => {
	const url = (req.url || '/').split('?')[0];
	let file;
	if (url === '/' || url === '/probe') file = path.join(ROOT, 'scripts/avatar-bg-probe.html');
	else if (url.startsWith('/agent-3d/')) file = path.join(ROOT, 'dist-lib', url.replace(/^\/agent-3d\/(latest|\d[\d.]*)\//, ''));
	else if (url.startsWith('/avatars/')) file = path.join(ROOT, 'public', url);
	else if (url.startsWith('/animations/')) file = path.join(ROOT, 'public', url);
	else file = path.join(ROOT, 'public', url);
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('nf: ' + url); return; }
	res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
	res.setHeader('Access-Control-Allow-Origin', '*');
	fs.createReadStream(file).pipe(res);
}).listen(4599, () => console.log('probe server on http://localhost:4599'));
